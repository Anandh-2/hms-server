#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://192.168.1.100:5000/api/attendance/rfid-log";

constexpr uint8_t RFID_SS_PIN = 5;
constexpr uint8_t RFID_RST_PIN = 22;
constexpr uint8_t MODE_PIN = 4;

constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
constexpr unsigned long DUPLICATE_BLOCK_MS = 3000;

MFRC522 mfrc522(RFID_SS_PIN, RFID_RST_PIN);

String lastTag = "";
unsigned long lastTagAt = 0;
unsigned long lastWifiCheckAt = 0;

String toHexTag(const MFRC522::Uid& uid) {
  String tag;
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) {
      tag += "0";
    }
    tag += String(uid.uidByte[i], HEX);
  }
  tag.toUpperCase();
  return tag;
}

String currentLogType() {
  return digitalRead(MODE_PIN) == LOW ? "exit" : "entry";
}

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi not connected");
  }
}

bool sendAttendanceLog(const String& tag, const String& logType) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"rfid_tag\":\"" + tag + "\",\"log_type\":\"" + logType + "\"}";
  int statusCode = http.POST(body);
  String responseBody = http.getString();

  Serial.print("HTTP ");
  Serial.println(statusCode);
  Serial.println(responseBody);

  http.end();
  return statusCode >= 200 && statusCode < 300;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(MODE_PIN, INPUT_PULLUP);

  SPI.begin();
  mfrc522.PCD_Init();

  ensureWiFiConnected();

  Serial.println("RFID attendance client ready");
  Serial.println("MODE_PIN HIGH => entry, LOW => exit");
}

void loop() {
  if (millis() - lastWifiCheckAt > WIFI_RETRY_INTERVAL_MS) {
    ensureWiFiConnected();
    lastWifiCheckAt = millis();
  }

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  const String tag = toHexTag(mfrc522.uid);
  const String logType = currentLogType();
  const unsigned long now = millis();

  if (tag == lastTag && now - lastTagAt < DUPLICATE_BLOCK_MS) {
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    return;
  }

  Serial.print("Tag: ");
  Serial.print(tag);
  Serial.print(" | Type: ");
  Serial.println(logType);

  if (sendAttendanceLog(tag, logType)) {
    lastTag = tag;
    lastTagAt = now;
    Serial.println("Attendance sent");
  } else {
    Serial.println("Failed to send attendance");
  }

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  delay(200);
}
