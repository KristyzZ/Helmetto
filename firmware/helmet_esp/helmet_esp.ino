#include <ESP8266WiFi.h>
#include <espnow.h>

extern "C" {
  #include <user_interface.h>
}

#define WIFI_CHANNEL 11

uint8_t receiverMac[] = {
  0x68, 0xC6, 0x3A, 0xA0, 0x59, 0x45
};

uint8_t message = 1;
bool espNowReady = false;

void setup() {
  Serial.begin(115200);

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  if (!wifi_set_channel(WIFI_CHANNEL)) {
    Serial.println("Could not set Wi-Fi channel");
    return;
  }

  if (esp_now_init() != 0) {
    Serial.println("ESP-NOW init failed!");
    return;
  }

  esp_now_set_self_role(ESP_NOW_ROLE_CONTROLLER);

  if (esp_now_add_peer(
        receiverMac,
        ESP_NOW_ROLE_SLAVE,
        WIFI_CHANNEL,
        nullptr,
        0) != 0) {
    Serial.println("Failed to add peer!");
    return;
  }

  espNowReady = true;
  Serial.println("Helmet transmitter ready!");
}

void loop() {
  if (!espNowReady) {
    delay(1000);
    return;
  }

  uint8_t result = esp_now_send(
    receiverMac,
    &message,
    sizeof(message)
  );

  if (result == 0) {
    Serial.println("Heartbeat queued");
  } else {
    Serial.println("Send error");
  }

  delay(1000);
}
