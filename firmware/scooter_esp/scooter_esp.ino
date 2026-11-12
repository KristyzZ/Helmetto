#include <ESP8266WiFi.h>
#include <Wire.h>
#include <espnow.h>

extern "C" {
#include <user_interface.h>
}

#if __has_include("wifi_config.h")
#include "wifi_config.h"
#else
#include "wifi_config.example.h"
#endif

constexpr uint8_t WIFI_CHANNEL = 6;
constexpr uint8_t MPU_ADDRESS = 0x68;
constexpr uint8_t MPU_POWER_MANAGEMENT = 0x6B;
constexpr uint8_t MPU_ACCEL_DATA = 0x3B;
constexpr uint32_t WARNING_THRESHOLD_MS = 3000;
constexpr uint32_t DISCONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MPU_READ_INTERVAL_MS = 500;

volatile uint32_t lastSignal = 0;
volatile bool heartbeatReceived = false;
bool mpuReady = false;

enum HelmetState {
  NOT_FOUND,
  CONNECTED,
  WAITING,
  DISCONNECTED
};

HelmetState helmetState = NOT_FOUND;

void onReceive(uint8_t *, uint8_t *data, uint8_t length) {
  if (length != 1 || data[0] != 1) return;

  lastSignal = millis();
  heartbeatReceived = true;
}

void updateHelmet() {
  noInterrupts();
  const bool received = heartbeatReceived;
  const uint32_t last = lastSignal;
  interrupts();

  if (!received) return;

  const uint32_t elapsed = millis() - last;
  HelmetState next = DISCONNECTED;
  if (elapsed < WARNING_THRESHOLD_MS) {
    next = CONNECTED;
  } else if (elapsed < DISCONNECT_TIMEOUT_MS) {
    next = WAITING;
  }

  if (next == helmetState) return;
  helmetState = next;

  switch (helmetState) {
    case CONNECTED:
      Serial.println("HELMET CONNECTED!");
      break;
    case WAITING:
      Serial.println("Helmet signal lost, waiting...");
      break;
    case DISCONNECTED:
      Serial.println("ALERT: HELMET DISCONNECTED!");
      break;
    case NOT_FOUND:
      break;
  }
}

void initMpu() {
  Wire.begin(4, 5);  // SDA, SCL
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(MPU_POWER_MANAGEMENT);
  Wire.write(0x00);
  mpuReady = Wire.endTransmission() == 0;
  Serial.println(mpuReady ? "MPU6050 initialized" : "MPU6050 initialization failed");
}

int16_t readMpuWord() {
  const uint16_t high = Wire.read();
  const uint16_t low = Wire.read();
  return static_cast<int16_t>((high << 8) | low);
}

void readMpu() {
  if (!mpuReady) return;

  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(MPU_ACCEL_DATA);
  if (Wire.endTransmission(false) != 0 ||
      Wire.requestFrom(MPU_ADDRESS, static_cast<uint8_t>(14)) != 14) {
    Serial.println("MPU6050 read failed");
    return;
  }

  const float ax = readMpuWord() / 16384.0f;
  const float ay = readMpuWord() / 16384.0f;
  const float az = readMpuWord() / 16384.0f;
  readMpuWord();  // Temperature
  const float gx = readMpuWord() / 131.0f;
  const float gy = readMpuWord() / 131.0f;
  const float gz = readMpuWord() / 131.0f;

  Serial.printf("ACC: %.2f %.2f %.2f g | GYRO: %.1f %.1f %.1f deg/s\n",
                ax, ay, az, gx, gy, gz);
}

void setup() {
  Serial.begin(115200);
  initMpu();

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  wifi_set_channel(WIFI_CHANNEL);
  Serial.print("Scooter STA MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != 0) {
    Serial.println("ESP-NOW initialization failed");
  } else if (esp_now_set_self_role(ESP_NOW_ROLE_SLAVE) != 0 ||
             esp_now_register_recv_cb(onReceive) != 0) {
    Serial.println("ESP-NOW receiver setup failed");
    esp_now_deinit();
  } else {
    Serial.println("Waiting for helmet...");
  }

  if (WIFI_SSID[0] != '\0') {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);
    Serial.println("Connecting to Wi-Fi...");
  } else {
    Serial.println("Wi-Fi credentials unset; starting with ESP-NOW only");
  }
}

void loop() {
  static bool wifiWasConnected = false;
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  if (wifiConnected != wifiWasConnected) {
    wifiWasConnected = wifiConnected;
    if (wifiConnected) {
      Serial.printf("Wi-Fi connected on channel %d\n", WiFi.channel());
      if (WiFi.channel() != WIFI_CHANNEL) {
        Serial.println("ESP-NOW channel mismatch: set the 2.4 GHz access point to channel 6");
      }
    } else {
      Serial.println("Wi-Fi disconnected");
    }
  }

  updateHelmet();

  static uint32_t lastMpuRead = 0;
  const uint32_t now = millis();
  if (now - lastMpuRead >= MPU_READ_INTERVAL_MS) {
    lastMpuRead = now;
    readMpu();
  }

  delay(10);
}
