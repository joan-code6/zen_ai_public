#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <time.h>
#include <cstring>

#include <GxEPD2_BW.h>
#include "ui.h"

// Display wiring (ESP32 GPIO numbers)
// BUSY -> GPIO4
// RST  -> GPIO16
// DC   -> GPIO17
// CS   -> GPIO5
// CLK  -> GPIO18
// DIN  -> GPIO23

// GPIO 13 -> Hard Reset button
// GPIO 19 -> Mode switch button

// run code and listen to serial: cd e-ink-display; pio run -t upload -t monitor

GxEPD2_BW<GxEPD2_290_T94, GxEPD2_290_T94::HEIGHT> display(GxEPD2_290_T94(/*CS*/5, /*DC*/17, /*RST*/16, /*BUSY*/4));

// -----------------------------------------------------------------------------
// Network & backend configuration
// -----------------------------------------------------------------------------
static constexpr char BACKEND_BASE_URL[] = "https://raspberrypi.tailf0b36d.ts.net"; // TODO: add dynamic loading
static constexpr char REGISTER_ENDPOINT[] = "/devices/register";
static constexpr char STATE_ENDPOINT[] = "/devices/state";
static constexpr char HEARTBEAT_ENDPOINT[] = "/devices/heartbeat";
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static constexpr uint32_t STATE_REFRESH_INTERVAL_MS = 60000;
static constexpr uint32_t HEARTBEAT_INTERVAL_MS = 30000;
static constexpr uint32_t PROVISIONING_MESSAGE_REFRESH_MS = 60000;
static constexpr char PREF_NAMESPACE[] = "zen_disp";
static constexpr char PREF_WIFI_SSID[] = "wifi_ssid";
static constexpr char PREF_WIFI_PASS[] = "wifi_pass";
static constexpr char PREF_DEVICE_ID[] = "device_id";
static constexpr char PREF_DEVICE_SECRET[] = "device_secret";
static constexpr char PREF_PAIRING_TOKEN[] = "pairing_token";
static constexpr char PREF_BLE_NAME[] = "ble_name";
static constexpr char PREF_FIRMWARE[] = "fw";
static constexpr char FIRMWARE_VERSION[] = "0.2.0";

static constexpr char BLE_SERVICE_UUID[] = "7c2c2001-3e64-4d89-a6fb-01bd1e78b541";
static constexpr char BLE_CREDENTIALS_CHAR_UUID[] = "7c2c2002-3e64-4d89-a6fb-01bd1e78b541";
static constexpr char BLE_PAIRING_CHAR_UUID[] = "7c2c2003-3e64-4d89-a6fb-01bd1e78b541";
static constexpr char BLE_STATUS_CHAR_UUID[] = "7c2c2004-3e64-4d89-a6fb-01bd1e78b541";

// -----------------------------------------------------------------------------
// UI globals consumed by ui.h draw functions
// -----------------------------------------------------------------------------
static char gCalSlotPrimary[64] = "Pair Zen Display";
static char gCalSlotSecondary[64] = "Add calendar";
static char gCalSlotThird[64] = "";
static char gCalLocation[48] = "";
static char gCalSelected[96] = "Open Zen Phone app";
static char gMailSlotPrimary[64] = "Connect Gmail";
static char gMailSelected[64] = "No email";
static char gMailSender[64] = "";
static char gMailSummary[192] = "Open Settings -> Connect Display";

// Left middle slot should show the second event of today
const char* cal_Layer_2_copy_text = gCalSlotSecondary;
// Right panel no longer uses this for Personen; keep for potential future use
const char* cal_Layer_8_copy_text = gCalSlotSecondary;
const char* cal_ort_details_text_text = gCalLocation;
const char* cal_selected_termin_text_text = gCalSelected;
// New: third calendar line in UI
const char* cal_termin_slot_3_text_text = gCalSlotThird;

const char* mail_Layer_2_copy_text = gMailSlotPrimary;
const char* mail_person_prefix_copy_text = gMailSummary;
const char* mail_selected_termin_text_text = gMailSelected;
const char* mail_termin_slot_3_text_text = gMailSender;

static char _mail_lines_buf[6][64];
const char* mail_person_line1 = _mail_lines_buf[0];
const char* mail_person_line2 = _mail_lines_buf[1];
const char* mail_person_line3 = _mail_lines_buf[2];
const char* mail_person_line4 = _mail_lines_buf[3];
const char* mail_person_line5 = _mail_lines_buf[4];
const char* mail_person_line6 = _mail_lines_buf[5];

static char currentTimeBuf[16] = "--:--";
const char* currentTimeStr = currentTimeBuf;

// -----------------------------------------------------------------------------
// Refresh gating
// -----------------------------------------------------------------------------
static char lastStateSignature[512] = "";   // fingerprint of last shown data
static bool minuteRefreshPending = false;    // set when HH:MM changes

// -----------------------------------------------------------------------------
// Mode button handling
// -----------------------------------------------------------------------------
const int MODE_PIN = 19;
int lastModeState = LOW;
int stableState = LOW;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;
bool lastButtonPressed = false;  // Track if button was pressed in previous loop

// -----------------------------------------------------------------------------
// Hard Reset button handling
// -----------------------------------------------------------------------------
const int RESET_PIN = 13;
int lastResetState = LOW;
int resetStableState = LOW;
unsigned long lastResetDebounceTime = 0;
const unsigned long resetDebounceDelay = 50;
bool lastResetPressed = false;

// -----------------------------------------------------------------------------
// Preferences and runtime state
// -----------------------------------------------------------------------------
Preferences prefs;
String wifiSsid;
String wifiPassword;
String deviceId;
String deviceSecret;
String pairingToken;
String bleName;
bool wifiConnected = false;
bool deviceRegistered = false;
bool stateReady = false;
unsigned long lastStateFetch = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastProvisioningRedraw = 0;
String lastProvHeadline;
String lastProvLine1;
String lastProvLine2;
String lastProvLine3;
bool provisioningDirty = true;

volatile bool credentialsUpdated = false;
String pendingSsid;
String pendingPassword;

NimBLECharacteristic* pairingInfoChar = nullptr;
NimBLECharacteristic* statusChar = nullptr;
bool bleInitialized = false;

enum class UiMode { Provisioning, Calendar, Email };
UiMode currentUi = UiMode::Provisioning;

// Forward declarations
void updateTime();
void drawCalendar();
void drawEmail();
void drawProvisioningScreen(const String& headline, const String& line1, const String& line2, const String& line3);
void startBleProvisioning();
void ensureBleAdvertising();
void handleProvisioningUi();
void attemptWifiConnection(const String& ssid, const String& password);
bool ensureWifiConnection();
void refreshDisplayForMode(UiMode targetMode);
void refreshCurrentDisplay();
void updatePairingCharacteristic();
void updateStatusCharacteristic(const String& status);
void sendHeartbeat();
String defaultBleName();

class CredentialCallbacks : public NimBLECharacteristicCallbacks {
 public:
  void onWrite(NimBLECharacteristic* characteristic) override {
    std::string raw = characteristic->getValue();
    Serial.print("BLE credentials received, length: ");
    Serial.println(raw.length());
    if (raw.empty()) {
      Serial.println("Empty credentials payload");
      return;
    }
    auto newlinePos = raw.find('\n');
    if (newlinePos == std::string::npos) {
      Serial.println("No newline separator found");
      return;
    }
    pendingSsid = String(raw.substr(0, newlinePos).c_str());
    pendingPassword = String(raw.substr(newlinePos + 1).c_str());
    Serial.print("Parsed SSID: ");
    Serial.println(pendingSsid);
    Serial.println("Password received (hidden)");
    credentialsUpdated = true;
  }
};

static CredentialCallbacks gCredentialCallbacks;

void copyToBuffer(char* target, size_t capacity, const String& value) {
  if (!target || capacity == 0) return;
  value.substring(0, capacity - 1).toCharArray(target, capacity);
}

void updateMailSummaryLines(const char* text) {
  if (!text) {
    for (auto& line : _mail_lines_buf) {
      line[0] = '\0';
    }
    return;
  }
  const size_t maxLen = 18;
  const char* cursor = text;
  for (int i = 0; i < 6; ++i) {
    _mail_lines_buf[i][0] = '\0';
  }
  for (int line = 0; line < 6 && *cursor; ++line) {
    const char* segmentStart = cursor;
    const char* lastSpace = nullptr;
    size_t len = 0;
    while (*cursor && len < maxLen) {
      if (*cursor == ' ') {
        lastSpace = cursor;
      }
      ++cursor;
      ++len;
    }
    size_t copyLen = len;
    if (*cursor && lastSpace && lastSpace > segmentStart) {
      copyLen = static_cast<size_t>(lastSpace - segmentStart);
      cursor = lastSpace + 1;
    }
    strncpy(_mail_lines_buf[line], segmentStart, copyLen);
    _mail_lines_buf[line][copyLen] = '\0';
  }
}

String defaultBleName() {
  uint64_t chipId = ESP.getEfuseMac();
  uint32_t suffix = static_cast<uint32_t>(chipId & 0xFFFF);
  char buffer[18];
  snprintf(buffer, sizeof(buffer), "ZenDisplay-%04X", suffix);
  return String(buffer);
}

void updateTime() {
  time_t now = time(nullptr);
  if (now < 10000) {
    strlcpy(currentTimeBuf, "--:--", sizeof(currentTimeBuf));
    return;
  }
  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  snprintf(currentTimeBuf, sizeof(currentTimeBuf), "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
}

// Get current time as HH:MM string (returns newly allocated string or nullptr if invalid)
String getCurrentTimeString() {
  time_t now = time(nullptr);
  if (now < 10000) {
    return "--:--";
  }
  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  char buf[6];
  snprintf(buf, sizeof(buf), "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
  return String(buf);
}

// Extract HH:MM from ISO 8601 timestamp (e.g., "2026-01-08T07:50:00+01:00")
void extractTimeFromISO(const char* isoTime, char* timeBuf, size_t bufSize) {
  if (!isoTime || bufSize < 6) {
    strlcpy(timeBuf, "--:--", bufSize);
    return;
  }
  // Format: YYYY-MM-DDTHH:MM:SS...
  // Extract HH:MM starting at position 11
  if (strlen(isoTime) > 16) {
    snprintf(timeBuf, bufSize, "%.5s", isoTime + 11);  // HH:MM
  } else {
    strlcpy(timeBuf, "--:--", bufSize);
  }
}

// Check if ISO date is today
bool isEventToday(const char* isoTime) {
  if (!isoTime || strlen(isoTime) < 10) {
    return false;
  }
  // Format: YYYY-MM-DDTHH:MM:SS...
  // Extract date YYYY-MM-DD
  char eventDate[11];
  snprintf(eventDate, sizeof(eventDate), "%.10s", isoTime);
  
  time_t now = time(nullptr);
  if (now < 10000) return false;
  
  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  char todayDate[11];
  strftime(todayDate, sizeof(todayDate), "%Y-%m-%d", &timeinfo);
  
  return strcmp(eventDate, todayDate) == 0;
}

void refreshDisplayForMode(UiMode targetMode) {
  if (currentUi == targetMode) {
    return;
  }
  
  // If switching to calendar mode but no calendar data available, switch to email instead
  if (targetMode == UiMode::Calendar && gCalSlotPrimary[0] == '\0') {
    targetMode = UiMode::Email;
  }
  
  display.setFullWindow();
  display.firstPage();
  if (targetMode == UiMode::Calendar) {
    do {
      drawCalendar();
    } while (display.nextPage());
  } else if (targetMode == UiMode::Email) {
    do {
      drawEmail();
    } while (display.nextPage());
  }
  currentUi = targetMode;
}

void refreshCurrentDisplay() {
  display.setFullWindow();
  display.firstPage();
  if (currentUi == UiMode::Calendar) {
    do {
      drawCalendar();
    } while (display.nextPage());
  } else if (currentUi == UiMode::Email) {
    do {
      drawEmail();
    } while (display.nextPage());
  }
}

void drawProvisioningScreen(const String& headline, const String& line1, const String& line2, const String& line3) {
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(2);
    display.setCursor(10, 35);
    display.print(headline);

    display.setTextSize(1);
    display.setCursor(10, 80);
    display.print(line1);
    display.setCursor(10, 100);
    display.print(line2);
    display.setCursor(10, 120);
    display.print(line3);
  } while (display.nextPage());
  currentUi = UiMode::Provisioning;
}

void handleProvisioningUi() {
  const unsigned long now = millis();
  String headline = wifiConnected ? "Waiting for pairing" : "Setup this display";
  String line1 = "Open the Zen AI Phone app";
  String line2 = wifiConnected
      ? "Tap 'Connect Display' and follow the instructions"
      : "Tap 'Connect Display' and follow the instructions";
  String line3 = "Select BLE " + bleName;

  bool changed =
      headline != lastProvHeadline ||
      line1 != lastProvLine1 ||
      line2 != lastProvLine2 ||
      line3 != lastProvLine3;

  if (changed) {
    lastProvHeadline = headline;
    lastProvLine1 = line1;
    lastProvLine2 = line2;
    lastProvLine3 = line3;
    provisioningDirty = true;
  }

  if (!provisioningDirty && (now - lastProvisioningRedraw) < PROVISIONING_MESSAGE_REFRESH_MS) {
    return;
  }

  drawProvisioningScreen(lastProvHeadline, lastProvLine1, lastProvLine2, lastProvLine3);
  lastProvisioningRedraw = now;
  provisioningDirty = false;
}

void ensureBleAdvertising() {
  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  if (advertising && !advertising->isAdvertising()) {
    advertising->start();
  }
}

// Static buffers for BLE characteristic values (must persist!)
static char pairingBuffer[256];
static char statusBuffer[64];

void updatePairingCharacteristic() {
  if (!pairingInfoChar) return;
  snprintf(pairingBuffer, sizeof(pairingBuffer), 
           "{\"deviceId\":\"%s\",\"token\":\"%s\"}", 
           deviceId.c_str(), pairingToken.c_str());
  Serial.print("Updating pairing characteristic with: ");
  Serial.println(pairingBuffer);
  pairingInfoChar->setValue((uint8_t*)pairingBuffer, strlen(pairingBuffer));
  pairingInfoChar->notify();
}

void updateStatusCharacteristic(const String& status) {
  if (!statusChar) {
    Serial.println("ERROR: statusChar is null!");
    return;
  }
  Serial.print("Updating status characteristic to: ");
  Serial.println(status);
  strncpy(statusBuffer, status.c_str(), sizeof(statusBuffer) - 1);
  statusBuffer[sizeof(statusBuffer) - 1] = '\0';
  statusChar->setValue((uint8_t*)statusBuffer, strlen(statusBuffer));
  statusChar->notify();
  Serial.println("Status notification sent");
}

void startBleProvisioning() {
  if (bleInitialized) {
    Serial.println("BLE already initialized, ensuring advertising...");
    ensureBleAdvertising();
    return;
  }
  Serial.print("Starting BLE with name: ");
  Serial.println(bleName);
  NimBLEDevice::init(bleName.c_str());
  NimBLEDevice::setPower(ESP_PWR_LVL_P7);
  NimBLEServer* server = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(BLE_SERVICE_UUID);

  NimBLECharacteristic* credentialsChar = service->createCharacteristic(
      BLE_CREDENTIALS_CHAR_UUID,
      NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  credentialsChar->setCallbacks(&gCredentialCallbacks);

  pairingInfoChar = service->createCharacteristic(
      BLE_PAIRING_CHAR_UUID,
      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);

  statusChar = service->createCharacteristic(
      BLE_STATUS_CHAR_UUID,
      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);

  service->start();
  Serial.println("BLE service started");
  
  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.print("BLE advertising started with UUID: ");
  Serial.println(BLE_SERVICE_UUID);

  updatePairingCharacteristic();
  updateStatusCharacteristic("idle");
  bleInitialized = true;
}

void attemptWifiConnection(const String& ssid, const String& password) {
  if (ssid.isEmpty()) {
    wifiConnected = false;
    Serial.println("Wi-Fi connection skipped: empty SSID");
    return;
  }
  Serial.print("Attempting Wi-Fi connection to: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  wifiConnected = WiFi.status() == WL_CONNECTED;
  if (wifiConnected) {
    Serial.print("Wi-Fi connected! IP: ");
    Serial.println(WiFi.localIP());
    wifiSsid = ssid;
    wifiPassword = password;
    prefs.putString(PREF_WIFI_SSID, wifiSsid);
    prefs.putString(PREF_WIFI_PASS, wifiPassword);
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    // Set timezone to UTC+1 with daylight saving (CET/CEST)
    // TZ string: CET-1CEST,M3.5.0/2,M10.5.0/3
    // - Standard time: CET is UTC+1 (note: POSIX uses negative for east of UTC)
    // - DST: CEST, starts last Sunday of March at 02:00, ends last Sunday of October at 03:00
    setenv("TZ", "CET-1CEST,M3.5.0/2,M10.5.0/3", 1);
    tzset();
    // Immediately compute currentTimeBuf using localtime with TZ
    updateTime();
    updateStatusCharacteristic("wifi_connected");
  } else {
    Serial.println("Wi-Fi connection failed!");
    updateStatusCharacteristic("wifi_failed");
  }
}

bool ensureWifiConnection() {
  if (wifiConnected && WiFi.status() == WL_CONNECTED) {
    return true;
  }
  wifiConnected = false;
  if (!wifiSsid.isEmpty()) {
    attemptWifiConnection(wifiSsid, wifiPassword);
  }
  return wifiConnected;
}

bool registerDeviceWithBackend() {
  if (!wifiConnected) {
    Serial.println("Cannot register: no Wi-Fi connection");
    return false;
  }
  if (!deviceId.isEmpty() && !deviceSecret.isEmpty()) {
    Serial.println("Device already registered, using cached credentials");
    updatePairingCharacteristic();
    updateStatusCharacteristic("registered");
    return true;
  }

  Serial.println("Registering device with backend...");
  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + REGISTER_ENDPOINT;
  if (!http.begin(url)) {
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<256> doc;
  doc["hardwareId"] = WiFi.macAddress();
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  if (code != HTTP_CODE_CREATED) {
    http.end();
    return false;
  }
  DynamicJsonDocument response(512);
  DeserializationError err = deserializeJson(response, http.getString());
  http.end();
  if (err) {
    return false;
  }
  deviceId = response["deviceId"].as<String>();
  deviceSecret = response["deviceSecret"].as<String>();
  pairingToken = response["pairingToken"].as<String>();
  Serial.print("Backend registration successful. DeviceId: ");
  Serial.println(deviceId);
  Serial.print("Pairing token: ");
  Serial.println(pairingToken);
  Serial.print("Device secret (debug): ");
  Serial.println(deviceSecret);
  String newBleName = response["bluetoothName"].as<String>();
  if (!newBleName.isEmpty()) {
    bleName = newBleName;
    prefs.putString(PREF_BLE_NAME, bleName);
    if (bleInitialized) {
      NimBLEDevice::setDeviceName(bleName.c_str());
      ensureBleAdvertising();
    }
  }
  prefs.putString(PREF_DEVICE_ID, deviceId);
  prefs.putString(PREF_DEVICE_SECRET, deviceSecret);
  prefs.putString(PREF_PAIRING_TOKEN, pairingToken);
  prefs.putString(PREF_FIRMWARE, FIRMWARE_VERSION);
  deviceRegistered = true;
  stateReady = false;
  updatePairingCharacteristic();
  updateStatusCharacteristic("registered");
  return true;
}

bool fetchDeviceState() {
  if (!wifiConnected || deviceId.isEmpty() || deviceSecret.isEmpty()) {
    return false;
  }
  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + STATE_ENDPOINT;
  if (!http.begin(url)) {
    return false;
  }
  // Debug: print credentials used for state fetch
  Serial.print("Fetching state with DeviceId: ");
  Serial.println(deviceId);
  Serial.print("Fetching state with DeviceSecret: ");
  Serial.println(deviceSecret);
  http.addHeader("X-Device-Id", deviceId);
  http.addHeader("X-Device-Secret", deviceSecret);
  int code = http.GET();
  Serial.print("State fetch HTTP code: ");
  Serial.println(code);
  if (code == HTTP_CODE_CONFLICT) {
    stateReady = false;
    String resp = http.getString();
    Serial.print("State fetch response (conflict): ");
    Serial.println(resp);
    http.end();
    updateStatusCharacteristic("waiting_for_claim");
    return false;
  }
  if (code != HTTP_CODE_OK) {
    String resp = http.getString();
    Serial.print("State fetch unexpected response: ");
    Serial.println(resp);
    http.end();
    return false;
  }
  String payload = http.getString();
  Serial.print("State response: ");
  Serial.println(payload);
  http.end();
  
  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    return false;
  }
  
  // Parse calendar directly
  JsonObjectConst calObj = doc["calendar"];
  Serial.print("Calendar obj - connected: ");
  Serial.println(calObj["connected"] | false);
  JsonArrayConst calItems = calObj["items"];
  
  // Collect up to three events to show: only today's
  String formatted[3];
  String locs[3];
  int count = 0;
  // First pass: today-only
  for (size_t i = 0; i < calItems.size() && count < 3; i++) {
    JsonObjectConst item = calItems[i];
    String start = item["start"] | "";
    if (start.isEmpty()) continue;
    if (isEventToday(start.c_str())) {
      String summary = item["summary"] | "";
      char timeBuf[6];
      extractTimeFromISO(start.c_str(), timeBuf, sizeof(timeBuf));
      formatted[count] = String(timeBuf) + " " + summary;
      locs[count] = item["location"] | "";
      Serial.print("Calendar today - "); Serial.println(formatted[count]);
      count++;
    }
  }
  if (count == 0) {
    Serial.println("No calendar items available");
    // Clear calendar UI when no events today
    copyToBuffer(gCalSlotPrimary, sizeof(gCalSlotPrimary), "");
    copyToBuffer(gCalSelected, sizeof(gCalSelected), "");
    copyToBuffer(gCalLocation, sizeof(gCalLocation), "");
    copyToBuffer(gCalSlotSecondary, sizeof(gCalSlotSecondary), "");
    copyToBuffer(gCalSlotThird, sizeof(gCalSlotThird), "");
  } else {
    // Fill UI buffers
    copyToBuffer(gCalSlotPrimary, sizeof(gCalSlotPrimary), formatted[0]);  // selected header line
    copyToBuffer(gCalSelected, sizeof(gCalSelected), formatted[0]);
    copyToBuffer(gCalLocation, sizeof(gCalLocation), locs[0]);
    copyToBuffer(gCalSlotSecondary, sizeof(gCalSlotSecondary), (count > 1) ? formatted[1] : "");
    copyToBuffer(gCalSlotThird, sizeof(gCalSlotThird), (count > 2) ? formatted[2] : "");
  }
  
  // Parse email directly
  JsonObjectConst emailObj = doc["email"];
  Serial.print("Email obj - connected: ");
  Serial.println(emailObj["connected"] | false);
  JsonArrayConst emailItems = emailObj["items"];
  String mailSubject = "";
  String mailSender = "";
  String mailSnippet = "";
  String senders[3] = {"", "", ""};
  size_t mailCount = 0;
  if (emailItems.size() > 0) {
    // Collect up to three senders; keep subject/snippet from first
    String summaries[3];
    for (size_t i = 0; i < emailItems.size() && mailCount < 3; ++i) {
      JsonObjectConst it = emailItems[i];
      senders[mailCount] = it["from"] | "";
      summaries[mailCount] = it["snippet"] | "";
      if (mailCount == 0) {
        mailSubject = it["subject"] | "";
        mailSnippet = it["snippet"] | "";
      }
      mailCount++;
    }
    // Log primary info
    Serial.print("Email - Subject: ");
    Serial.println(mailSubject);
    Serial.print("Email - From: ");
    Serial.println(senders[0]);
    Serial.print("Email - Summary: ");
    Serial.println(mailSnippet);
    // Selected (top) should show sender of the first email
    copyToBuffer(gMailSelected, sizeof(gMailSelected), senders[0]);
    // Rows below: show other senders if available
    copyToBuffer(gMailSlotPrimary, sizeof(gMailSlotPrimary), mailCount > 1 ? senders[1] : "");
    copyToBuffer(gMailSender, sizeof(gMailSender), mailCount > 2 ? senders[2] : "");
    // Preserve summary/snippet (AI-generated content summary)
    copyToBuffer(gMailSummary, sizeof(gMailSummary), mailSnippet);
    updateMailSummaryLines(gMailSummary);
  } else {
    Serial.println("No email items");
  }
  
  // Build a compact signature of the visible content to avoid unnecessary redraws
  String sig = "cal:";
  sig += String(count);
  for (int i = 0; i < count; ++i) {
    sig += "|";
    sig += formatted[i];
  }
  if (count > 0) {
    sig += "|loc0:";
    sig += locs[0];
  }
  sig += ";mail:";
  sig += mailSubject; sig += "|"; sig += senders[0]; sig += "|"; sig += mailSnippet;
  char newSig[sizeof(lastStateSignature)] = {0};
  sig.substring(0, sizeof(lastStateSignature) - 1).toCharArray(newSig, sizeof(newSig));
  bool contentChanged = strcmp(lastStateSignature, newSig) != 0;
  if (contentChanged) {
    strncpy(lastStateSignature, newSig, sizeof(lastStateSignature) - 1);
    lastStateSignature[sizeof(lastStateSignature) - 1] = '\0';
  }
  
  updateTime();
  stateReady = true;
  updateStatusCharacteristic("ready");
  Serial.println("State fetch successful, display ready");
  // Refresh only if content changed or we have a minute tick pending
  if (currentUi == UiMode::Provisioning) {
    refreshDisplayForMode(UiMode::Calendar);
    minuteRefreshPending = false;
  } else if (contentChanged || minuteRefreshPending) {
    refreshCurrentDisplay();
    minuteRefreshPending = false;
  } else {
    // No redraw needed
  }
  return true;
}

void sendHeartbeat() {
  if (!wifiConnected || deviceId.isEmpty()) return;
  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + HEARTBEAT_ENDPOINT;
  if (!http.begin(url)) {
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", deviceId);
  http.addHeader("X-Device-Secret", deviceSecret);
  StaticJsonDocument<256> doc;
  if (wifiConnected) {
    doc["wifiSsid"] = wifiSsid;
    doc["wifiRssi"] = WiFi.RSSI();
  }
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

// -----------------------------------------------------------------------------
// Reset functionality
// -----------------------------------------------------------------------------
void performFactoryReset() {
  Serial.println("Factory reset initiated - clearing all data...");
  
  // Clear all preferences
  prefs.remove(PREF_WIFI_SSID);
  prefs.remove(PREF_WIFI_PASS);
  prefs.remove(PREF_DEVICE_ID);
  prefs.remove(PREF_DEVICE_SECRET);
  prefs.remove(PREF_PAIRING_TOKEN);
  prefs.remove(PREF_BLE_NAME);
  prefs.remove(PREF_FIRMWARE);
  
  // Clear runtime variables
  wifiSsid = "";
  wifiPassword = "";
  deviceId = "";
  deviceSecret = "";
  pairingToken = "";
  bleName = defaultBleName();
  
  // Reset state
  wifiConnected = false;
  deviceRegistered = false;
  stateReady = false;
  currentUi = UiMode::Provisioning;
  
  // Clear BLE if initialized
  if (bleInitialized) {
    NimBLEDevice::deinit();
    bleInitialized = false;
  }
  
  Serial.println("All data cleared. Device will restart...");
  delay(1000);
  ESP.restart();
}

void setup() {
  Serial.begin(115200);
  delay(50);
  Serial.println("Zen Display booting...");

  pinMode(MODE_PIN, INPUT_PULLDOWN);
  pinMode(RESET_PIN, INPUT_PULLDOWN);

  prefs.begin(PREF_NAMESPACE, false);
  wifiSsid = prefs.getString(PREF_WIFI_SSID, "");
  wifiPassword = prefs.getString(PREF_WIFI_PASS, "");
  deviceId = prefs.getString(PREF_DEVICE_ID, "");
  deviceSecret = prefs.getString(PREF_DEVICE_SECRET, "");
  pairingToken = prefs.getString(PREF_PAIRING_TOKEN, "");
  bleName = prefs.getString(PREF_BLE_NAME, defaultBleName());

  const int BUSY_PIN = 4;
  const int RST_PIN = 16;
  pinMode(RST_PIN, OUTPUT);
  pinMode(BUSY_PIN, INPUT);
  digitalWrite(RST_PIN, HIGH);
  delay(10);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  delay(10);
  SPI.begin(18, 19, 23, 5);
  display.init();
  display.setRotation(1);

  Serial.println("\n=== Starting BLE Provisioning ===");
  startBleProvisioning();
  Serial.println("BLE provisioning complete\n");
  
  handleProvisioningUi();

  if (!wifiSsid.isEmpty()) {
    attemptWifiConnection(wifiSsid, wifiPassword);
  }
}

static unsigned long lastTimeUpdate = 0;
static String lastTimeString = "--:--";
static constexpr uint32_t TIME_CHECK_INTERVAL_MS = 1000;  // Check time every second

void loop() {
  // Check and update time only when it changes (minute changes)
  unsigned long now = millis();
  if (now - lastTimeUpdate > TIME_CHECK_INTERVAL_MS) {
    lastTimeUpdate = now;
    String currentTime = getCurrentTimeString();
    if (currentTime != lastTimeString) {
      lastTimeString = currentTime;
      updateTime();
      // On minute change, schedule a UI refresh; prefer syncing after a state fetch
      minuteRefreshPending = true;
      if (wifiConnected && deviceRegistered) {
        // Force a fresh state fetch at the minute boundary
        lastStateFetch = 0; // ensure interval condition passes below
      } else if (stateReady && currentUi != UiMode::Provisioning) {
        // If not connected/registered yet, at least refresh the current UI now
        refreshCurrentDisplay();
        minuteRefreshPending = false;
      }
    }
  }
  
  if (credentialsUpdated) {
    credentialsUpdated = false;
    if (!pendingSsid.isEmpty()) {
      Serial.println("New credentials received, clearing ALL registration state");
      deviceRegistered = false;
      stateReady = false;
      // Clear cached device credentials to force fresh registration
      deviceId = "";
      deviceSecret = "";
      pairingToken = "";
      prefs.remove(PREF_DEVICE_ID);
      prefs.remove(PREF_DEVICE_SECRET);
      prefs.remove(PREF_PAIRING_TOKEN);
      updateStatusCharacteristic("connecting");
      attemptWifiConnection(pendingSsid, pendingPassword);
    }
  }

  if (!ensureWifiConnection()) {
    handleProvisioningUi();
    ensureBleAdvertising();
    delay(200);
    return;
  }

  if (!deviceRegistered) {
    Serial.println("Device not registered, attempting registration...");
    deviceRegistered = registerDeviceWithBackend();
    if (!deviceRegistered) {
      Serial.println("Registration failed, will retry");
      handleProvisioningUi();
      delay(500);
      return;
    }
    Serial.println("Registration successful!");
  }

  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  if (millis() - lastStateFetch > STATE_REFRESH_INTERVAL_MS || !stateReady) {
    lastStateFetch = millis();
    fetchDeviceState();
  }

  if (!stateReady) {
    handleProvisioningUi();
    delay(500);
    return;
  }
  int reading = digitalRead(MODE_PIN);
  if (reading != lastModeState) {
    lastDebounceTime = millis();
  }
  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != stableState) {
      stableState = reading;
      updateTime();
      // Detect button press (transition from LOW to HIGH)
      bool buttonPressed = (stableState == HIGH && !lastButtonPressed);
      if (buttonPressed) {
        // Toggle between Calendar and Email modes
        if (currentUi == UiMode::Calendar) {
          refreshDisplayForMode(UiMode::Email);
        } else {
          refreshDisplayForMode(UiMode::Calendar);
        }
      }
      lastButtonPressed = (stableState == HIGH);
    }
  }
  lastModeState = reading;

  // Handle reset button
  int resetReading = digitalRead(RESET_PIN);
  if (resetReading != lastResetState) {
    lastResetDebounceTime = millis();
  }
  if ((millis() - lastResetDebounceTime) > resetDebounceDelay) {
    if (resetReading != resetStableState) {
      resetStableState = resetReading;
      // Detect reset button press (transition from LOW to HIGH)
      bool resetPressed = (resetStableState == HIGH && !lastResetPressed);
      if (resetPressed) {
        Serial.println("Reset button pressed - performing factory reset...");
        performFactoryReset();
      }
      lastResetPressed = (resetStableState == HIGH);
    }
  }
  lastResetState = resetReading;

  // Avoid fixed waits; yield without sleeping to keep loop responsive
  delay(0);
}
