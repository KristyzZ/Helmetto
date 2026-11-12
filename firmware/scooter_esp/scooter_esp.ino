#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <time.h>
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

#if __has_include("telemetry_config.h")
#include "telemetry_config.h"
#else
#include "telemetry_config.example.h"
#endif

constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000;
constexpr uint16_t TELEMETRY_TIMEOUT_MS = 2000;
constexpr time_t MIN_TLS_TIME = 1704067200;  // 2024-01-01 UTC
constexpr uint8_t WIFI_CHANNEL = 6;
constexpr uint8_t MPU_ADDRESS = 0x68;
constexpr uint8_t MPU_POWER_MANAGEMENT = 0x6B;
constexpr uint8_t MPU_ACCEL_CONFIG = 0x1C;
constexpr uint8_t MPU_ACCEL_RANGE_8G = 0x10;
constexpr float MPU_ACCEL_LSB_PER_G = 4096.0f;
constexpr float MPU_Z_CORRECTION_G = 0.11f;
constexpr uint8_t MPU_ACCEL_DATA = 0x3B;
constexpr uint32_t WARNING_THRESHOLD_MS = 3000;
constexpr uint32_t DISCONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MPU_READ_INTERVAL_MS = 10;
constexpr uint32_t MPU_PRINT_INTERVAL_MS = 500;
constexpr float IMPACT_THRESHOLD_G = 2.5f;
constexpr uint32_t IMPACT_COOLDOWN_MS = 1000;

volatile uint32_t lastSignal = 0;
volatile bool heartbeatReceived = false;
bool mpuReady = false;
bool impactPending = false;

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

bool writeMpuRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

void initMpu() {
  Wire.begin(4, 5);  // SDA, SCL
  mpuReady = writeMpuRegister(MPU_POWER_MANAGEMENT, 0x00) &&
             writeMpuRegister(MPU_ACCEL_CONFIG, MPU_ACCEL_RANGE_8G);
  Serial.println(mpuReady ? "MPU6050 initialized" : "MPU6050 initialization failed");
}

int16_t readMpuWord() {
  const uint16_t high = Wire.read();
  const uint16_t low = Wire.read();
  return static_cast<int16_t>((high << 8) | low);
}

void readMpu(uint32_t now) {
  if (!mpuReady) return;

  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(MPU_ACCEL_DATA);
  if (Wire.endTransmission(false) != 0 ||
      Wire.requestFrom(MPU_ADDRESS, static_cast<uint8_t>(14)) != 14) {
    static uint32_t lastReadError = 0;
    if (now - lastReadError >= MPU_PRINT_INTERVAL_MS) {
      lastReadError = now;
      Serial.println("MPU6050 read failed");
    }
    return;
  }

  const float ax = readMpuWord() / MPU_ACCEL_LSB_PER_G;
  const float ay = readMpuWord() / MPU_ACCEL_LSB_PER_G;
  const float az = readMpuWord() / MPU_ACCEL_LSB_PER_G + MPU_Z_CORRECTION_G;
  readMpuWord();  // Temperature
  const float gx = readMpuWord() / 131.0f;
  const float gy = readMpuWord() / 131.0f;
  const float gz = readMpuWord() / 131.0f;

  const float accelerationSquared = ax * ax + ay * ay + az * az;
  const bool aboveThreshold = accelerationSquared >= IMPACT_THRESHOLD_G * IMPACT_THRESHOLD_G;
  static bool wasAboveThreshold = false;
  static uint32_t lastImpact = 0;
  static bool impactReported = false;
  if (aboveThreshold && !wasAboveThreshold &&
      (!impactReported || now - lastImpact >= IMPACT_COOLDOWN_MS)) {
    lastImpact = now;
    impactReported = true;
    impactPending = true;
    Serial.printf("IMPACT: %.2f g\n", sqrtf(accelerationSquared));
  }
  wasAboveThreshold = aboveThreshold;

  static uint32_t lastPrint = 0;
  if (now - lastPrint < MPU_PRINT_INTERVAL_MS) return;
  lastPrint = now;

  Serial.printf("ACC: %.2f %.2f %.2f g | GYRO: %.1f %.1f %.1f deg/s\n",
                ax, ay, az, gx, gy, gz);
}

int postTelemetry(WiFiClient &client, const String &body) {
  HTTPClient http;
  if (!http.begin(client, TELEMETRY_URL)) return -1;

  http.setTimeout(TELEMETRY_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", TELEMETRY_DEVICE_KEY);
  const int status = http.POST(body);
  http.end();
  return status;
}

void updateTelemetry(uint32_t now, bool wifiConnected) {
  if (!wifiConnected || TELEMETRY_URL[0] == '\0' || TELEMETRY_DEVICE_KEY[0] == '\0') return;

  static uint32_t lastAttempt = 0;
  if (now - lastAttempt < TELEMETRY_INTERVAL_MS) return;
  lastAttempt = now;

  const bool helmetConnected = helmetState == CONNECTED || helmetState == WAITING;
  const char *crashDetected = !mpuReady ? "null" : impactPending ? "true" : "false";
  String body = String("{\"helmet_connected\":") + (helmetConnected ? "true" : "false") +
                ",\"crash_detected\":" + crashDetected + "}";

  int status;
  if (strncmp(TELEMETRY_URL, "https://", 8) == 0) {
    if (TELEMETRY_CA_PEM[0] == '\0' || time(nullptr) < MIN_TLS_TIME) {
      Serial.println("Telemetry HTTPS needs a CA certificate and synchronized time");
      return;
    }
    static BearSSL::X509List trustAnchor(TELEMETRY_CA_PEM);
    static BearSSL::Session session;
    BearSSL::WiFiClientSecure client;
    client.setTrustAnchors(&trustAnchor);
    client.setSession(&session);
    status = postTelemetry(client, body);
  } else if (strncmp(TELEMETRY_URL, "http://", 7) == 0) {
    WiFiClient client;
    status = postTelemetry(client, body);
  } else {
    Serial.println("Telemetry URL must start with http:// or https://");
    return;
  }

  if (status == HTTP_CODE_OK) {
    if (impactPending) Serial.println("Telemetry sent: impact");
    impactPending = false;
  } else {
    Serial.printf("Telemetry POST failed: %d\n", status);
  }
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
      if (strncmp(TELEMETRY_URL, "https://", 8) == 0) {
        configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      }
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
    readMpu(now);
  }

  updateTelemetry(now, wifiConnected);
  delay(1);
}
