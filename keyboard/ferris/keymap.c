#include "fpiedrah.h"
#include "g/keymap_combo.h"


const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {

    [_ZTRON] = LAYOUT_FERRIS_WRAPPER(
        ____ZTRON_L1____,       ____ZTRON_R1____,
        ____ZTRON_L2____,       ____ZTRON_R2____,
        ____ZTRON_L3____,       ____ZTRON_R3____,
          __ZTRON_LT__,           __ZTRON_RT__
    ),

    [_SYMBOL] = LAYOUT_FERRIS_WRAPPER(
        ___SYMBOL_L1___,        ___SYMBOL_R1___,
        ___SYMBOL_L2___,        ___SYMBOL_R2___,
        ___SYMBOL_L3___,        ___SYMBOL_R3___,
         __SYMBOL_LT__,           __SYMBOL_RT__
    ),

    [_NUMBER] = LAYOUT_FERRIS_WRAPPER(
        ___NUMBER_L1___,        ___NUMBER_R1___,
        ___NUMBER_L2___,        ___NUMBER_R2___,
        ___NUMBER_L3___,        ___NUMBER_R3___,
         __NUMBER_LT__,          __NUMBER_RT__
    )

};
