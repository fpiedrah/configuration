#include "fpiedrah.h"


const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {

    [_ZTRON] = LAYOUT_GERGOPLEX_WRAPPER(
        ____ZTRON_L1____,       ____ZTRON_R1____,
        ____ZTRON_L2____,       ____ZTRON_R2____,
        ____ZTRON_L3____,       ____ZTRON_R3____,
         __ZTRON_LT_GP__,       __ZTRON_RT_GP__ 
    ),

    [_SYMBOL] = LAYOUT_GERGOPLEX_WRAPPER(
        ___SYMBOL_L1___,        ___SYMBOL_R1___,
        ___SYMBOL_L2___,        ___SYMBOL_R2___,
        ___SYMBOL_L3___,        ___SYMBOL_R3___,
        __SYMBOL_LT_GP__,       __SYMBOL_RT_GP__
    ),

    [_XMONAD] = LAYOUT_GERGOPLEX_WRAPPER(
        ___XMONAD_L1___,        ___XMONAD_R1___,
        ___XMONAD_L2___,        ___XMONAD_R2___,
        ___XMONAD_L3___,        ___XMONAD_R3___,
        __XMONAD_LT_GP__,       __XMONAD_RT_GP__
    )
};
