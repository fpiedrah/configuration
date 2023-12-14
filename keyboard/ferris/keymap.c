#include "fpiedrah.h"


const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {

    [_ZTRON] = LAYOUT_FERRIS_WRAPPER(
        ____ZTRON_L1____,       ____ZTRON_R1____,
        ____ZTRON_L2____,       ____ZTRON_R2____,
        ____ZTRON_L3____,       ____ZTRON_R3____,
         __ZTRON_LT_FR__,       __ZTRON_RT_FR__ 
    ),

    [_SYMBOL] = LAYOUT_FERRIS_WRAPPER(
        ___SYMBOL_L1___,        ___SYMBOL_R1___,
        ___SYMBOL_L2___,        ___SYMBOL_R2___,
        ___SYMBOL_L3___,        ___SYMBOL_R3___,
        __SYMBOL_LT_FR__,       __SYMBOL_RT_FR__
    ),

    [_XMONAD] = LAYOUT_FERRIS_WRAPPER(
        ___XMONAD_L1___,        ___XMONAD_R1___,
        ___XMONAD_L2___,        ___XMONAD_R2___,
        ___XMONAD_L3___,        ___XMONAD_R3___,
        __XMONAD_LT_FR__,       __XMONAD_RT_FR__
    )
};
