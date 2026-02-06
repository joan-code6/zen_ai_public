
static const unsigned char PROGMEM image_calendar_bits[] = {0x09,0x20,0x76,0xdc,0xff,0xfe,0xff,0xfe,0x80,0x02,0x86,0xda,0x86,0xda,0x80,0x02,0xb6,0xda,0xb6,0xda,0x80,0x02,0xb6,0xc2,0xb6,0xc2,0x80,0x02,0x7f,0xfc,0x00,0x00};

static const unsigned char PROGMEM image_message_mail_bits[] = {0x00,0x00,0x00,0x7f,0xff,0x00,0xc0,0x01,0x80,0xe0,0x03,0x80,0xb0,0x06,0x80,0x98,0x0c,0x80,0x8c,0x18,0x80,0x86,0x30,0x80,0x83,0x60,0x80,0x85,0xd0,0x80,0x88,0x08,0x80,0x90,0x04,0x80,0xa0,0x02,0x80,0xc0,0x01,0x80,0x7f,0xff,0x00,0x00,0x00,0x00};

static const unsigned char PROGMEM image_rounding_bits[] = {0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x30,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00};

// ui shared bitmaps only; specific draw functions are in ui/calendar.h and ui/email.h
// declare display provided by main.cpp
extern GxEPD2_BW<GxEPD2_290_T94, GxEPD2_290_T94::HEIGHT> display;
// declare current time supplied by main.cpp
extern const char* currentTimeStr; // provided by main.cpp

// Calendar drawing implementation
extern const char* cal_Layer_2_copy_text;
extern const char* cal_Layer_8_copy_text;
extern const char* cal_ort_details_text_text;
extern const char* cal_selected_termin_text_text;
extern const char* cal_termin_slot_3_text_text;

void drawCalendar(void) {
    display.fillScreen(GxEPD_WHITE);

    // selected_termin_box
    display.fillRoundRect(5, 25, 190, 28, 3, GxEPD_BLACK);

    // termin_slot_2_box
    display.drawRoundRect(5, 58, 183, 28, 3, GxEPD_BLACK);

    // Layer 2 copy
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(2);
    display.setTextWrap(false);
    display.setCursor(11, 64);
    display.print(cal_Layer_2_copy_text);

    // selected_termin_detail_box
    display.fillRoundRect(191, 25, 102, 100, 3, GxEPD_BLACK);

    // Layer 8
    display.setTextColor(GxEPD_WHITE);
    display.setTextSize(1);
    display.setCursor(197, 59);
    display.print("Ort:");

    // ort_details_text
    display.setTextSize(2);
    display.setCursor(196, 69);
    display.print(cal_ort_details_text_text);

    // person_prefix
    display.setTextSize(1);
    display.setCursor(196, 88);
    display.print("Personen:");

    // termin_slot_3_box
    display.drawRoundRect(5, 91, 183, 28, 3, GxEPD_BLACK);

    // Personen details (not available in snapshot) -> leave empty
    display.setTextSize(2);
    display.setCursor(196, 98);
    display.print("");

    // termin_slot_3_text
    display.setTextColor(GxEPD_BLACK);
    display.setCursor(11, 97);
    display.print(cal_termin_slot_3_text_text);

    // selected_termin_text
    display.setTextColor(GxEPD_WHITE);
    display.setCursor(10, 32);
    display.print(cal_selected_termin_text_text);

    // nav_bar
    display.drawRoundRect(0, -10, 296, 30, 3, GxEPD_BLACK);

    // currently_selected_mode (calendar selected -> white icon)
    display.fillRoundRect(3, -12, 20, 30, 2, GxEPD_BLACK);

    // calendar (selected icon should be white)
    display.drawBitmap(6, 1, image_calendar_bits, 15, 16, GxEPD_WHITE);

    // rounding
    display.drawBitmap(131, 53, image_rounding_bits, 60, 25, GxEPD_BLACK);

    // message_mail
    display.drawBitmap(26, 1, image_message_mail_bits, 17, 16, GxEPD_BLACK);

    // current_time (from main.cpp)
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(1);
    display.setCursor(260, 6);
    display.print(currentTimeStr);
}

// Email drawing implementation
extern const char* mail_Layer_2_copy_text;
extern const char* mail_person_prefix_copy_text;
extern const char* mail_selected_termin_text_text;
extern const char* mail_termin_slot_3_text_text;
extern const char* mail_person_line1;
extern const char* mail_person_line2;
extern const char* mail_person_line3;
extern const char* mail_person_line4;
extern const char* mail_person_line5;
extern const char* mail_person_line6;

void drawEmail(void) {
    display.fillScreen(GxEPD_WHITE);

    // selected_termin_box
    display.fillRoundRect(5, 25, 190, 28, 3, GxEPD_BLACK);

    // termin_slot_2_box
    display.drawRoundRect(5, 58, 183, 28, 3, GxEPD_BLACK);

    // Layer 2 copy
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(2);
    display.setTextWrap(false);
    display.setCursor(11, 64);
    display.print(mail_Layer_2_copy_text);

    // selected_termin_detail_box
    display.fillRoundRect(191, 25, 102, 100, 3, GxEPD_BLACK);

    // person_prefix
    display.setTextColor(GxEPD_WHITE);
    display.setTextSize(1);
    display.setCursor(195, 53);
    display.print("AI summary:");

    // termin_slot_3_box
    display.drawRoundRect(5, 91, 183, 28, 3, GxEPD_BLACK);

    // termin_slot_3_text
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(2);
    display.setCursor(11, 97);
    display.print(mail_termin_slot_3_text_text);

    // selected_termin_text
    display.setTextColor(GxEPD_WHITE);
    display.setCursor(10, 32);
    display.print(mail_selected_termin_text_text);

    // nav_bar
    display.drawRoundRect(0, -10, 296, 30, 3, GxEPD_BLACK);

    // currently_selected_mode (email selected -> white icon)
    display.fillRoundRect(24, -12, 21, 30, 2, GxEPD_BLACK);

    // calendar (unselected)
    display.drawBitmap(6, 1, image_calendar_bits, 15, 16, GxEPD_BLACK);

    // person_prefix copy
    display.setTextSize(1);
    display.setCursor(195, 63);
    display.print(mail_person_line1);

    // rounding
    display.drawBitmap(131, 53, image_rounding_bits, 60, 25, GxEPD_BLACK);

    // person_prefix copy
    display.setCursor(195, 71);
    display.print(mail_person_line2);

    // message_mail (selected -> white icon)
    display.drawBitmap(26, 1, image_message_mail_bits, 17, 16, GxEPD_WHITE);

    // person_prefix copy
    display.setCursor(195, 79);
    display.print(mail_person_line3);

    // current_time (from main.cpp)
    display.setTextColor(GxEPD_BLACK);
    display.setCursor(260, 6);
    display.print(currentTimeStr);

    // extra lines
    display.setTextColor(GxEPD_WHITE);
    display.setCursor(195, 87);
    display.print(mail_person_line4);
    display.setCursor(195, 95); display.print(mail_person_line5);
    display.setCursor(195, 103); display.print(mail_person_line6);
    display.setCursor(195, 112); display.print("");
}
