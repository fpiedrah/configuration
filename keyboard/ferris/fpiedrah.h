#pragma once

#include QMK_KEYBOARD_H
#include "keymap_us_international.h"

#if (!defined(LAYOUT) && defined(KEYMAP))
#    define LAYOUT KEYMAP
#endif


// LAYOUTS
#define LAYOUT_GERGOPLEX_WRAPPER(...)   LAYOUT_split_3x5_3(__VA_ARGS__)
#define LAYOUT_FERRIS_WRAPPER(...) LAYOUT_split_3x5_2(__VA_ARGS__)


// LAYERS
enum layers {
    _ZTRON = 0,
    _SYMBOL,
    _NUMBER,
};

// ZTRON
//
//  -----------------------------          -----------------------------
// |  Y  |  C  |  ,  |  F  |  =  |        |  _  |  L  |  .  |  U  |  Q  |
// |-----+-----+-----+-----+-----|        |-----+-----+-----+-----+-----|
// |  O  |  S  |  I  |  N  |  P  |        |  D  |  T  |  H  |  A  |  R  |
// |-----+-----+-----+-----+-----|        |-----+-----+-----+-----+-----|
// |  "  |  '  |  G  |  J  |  B  |        |  W  |  M  |  K  |  (  |  )  |
//  -----------+-----+-----+-----|        |-----+-----+-----+-----------
//             |     | SFT |  E  |        | SPC | SFT |     |
//              -----------------          -----------------
//
//  REMOVE: Z -> (U + Q)    COMBOS: (U + Q) -> Z         (I + N) -> ESC          (L + , + U) -> BACK WORD
//          X -> (Y + C)            (' + G) -> V         (I + H) -> CAPS WORD
//          V -> (' + G)            (Y + C) -> X         (. + U) -> BSPC
//                                  (H + A) -> ENTER     (S + I) -> TAB
//

#define MD_S MT(MOD_LALT, KC_S)
#define MD_I MT(MOD_LCTL, KC_I)
#define MD_N MT(MOD_LGUI, KC_N)

#define MD_T MT(MOD_RGUI, KC_T)
#define MD_H MT(MOD_RCTL, KC_H)
#define MD_A MT(MOD_RALT, KC_A)

#define ____ZTRON_L1____    KC_Y,    KC_C,    KC_COMM, KC_F, KC_EQL
#define ____ZTRON_L2____    KC_O,    MD_S,    MD_I,    MD_N, KC_P
#define ____ZTRON_L3____    KC_DQT,  KC_QUOT, KC_G,    KC_J, KC_B

#define ____ZTRON_R1____    KC_UNDS, KC_L,   KC_DOT, KC_U,    KC_Q
#define ____ZTRON_R2____    KC_D,    MD_T,   MD_H,   MD_A,    KC_R
#define ____ZTRON_R3____    KC_W,    KC_M,   KC_K,   KC_LPRN, KC_RPRN

#define __ZTRON_LT__        KC_LSFT, KC_E
#define __ZTRON_RT__        KC_SPC,  KC_RSFT


// SYMBOL
//
//  -----------------------------          -----------------------------
// |  #  |  ¡  |  !  |  -  |  %  |        |     |  &  |  [  |  ]  |  ^  |
// +-----+-----+-----+-----+-----|        |-----+-----+-----+-----+-----|
// |  :  |  ¿  |  ?  |  +  |     |        |     |  ~  |  {  |  }  |  ;  |
// +-----+-----+-----+-----+-----|        |-----+-----+-----+-----+-----|
// |  $  |  \  |  /  |  *  |     |        |     |  |  |  <  |  >  |  @  |
//  -----------+-----+-----+-----|        |-----+-----+-----+-----------
//                   | SFT |  E  |        | SPC | SFT |
//                    -----------          -----------
//
//  COMBOS: (¡ + ! + -) -> BSPC             (& + [ + ]) -> BACK WORD
//          (: + ¿ + ?) -> TAB              (~ + { + }) -> ENTER
//

#define ___SYMBOL_L1___    KC_NUHS, US_IEXL, KC_EXLM, KC_PMNS, KC_PERC
#define ___SYMBOL_L2___    KC_COLN, US_IQUE, KC_QUES, KC_PPLS, KC_NO
#define ___SYMBOL_L3___    KC_DLR,  KC_BSLS, KC_SLSH, KC_PAST, KC_NO

#define ___SYMBOL_R1___    KC_NO,   KC_AMPR, KC_LBRC, KC_RBRC, KC_CIRC
#define ___SYMBOL_R2___    KC_NO,   KC_TILD, KC_LCBR, KC_RCBR, KC_SCLN
#define ___SYMBOL_R3___    KC_NO,   KC_PIPE, KC_LABK, KC_RABK, KC_AT

#define __SYMBOL_LT__      KC_LSFT, KC_E
#define __SYMBOL_RT__      KC_SPC,  KC_RSFT


// XMONAD
//
//  -----------------------------          -----------------------------
// |  1  |  2  |  3  |  4  |  5  |        |  6  |  7  |  8  |  9  |  0  |
// +-----+-----+-----+-----+-----|        |-----+-----+-----+-----+-----|
// | GUI | AUI |  J  |  K  |     |        |     |  J  |  K  | AUI | GUI |
// +-----+-----+-----+-----+-----|        |-----+-----+-----+-----+-----|
// |     |     |     |     |     |        |     |     |     |     |     |
//  -----------+-----+-----+-----|        |-----+-----+-----+-----------
//             |     | SFT |  E  |        | SPC | SFT |     |
//              -----------------          -----------------
//

#define ___NUMBER_L1___    KC_1, KC_2, KC_3, KC_4, KC_5
#define ___NUMBER_L2___    KC_NO, KC_NO, KC_NO, KC_NO, KC_NO
#define ___NUMBER_L3___    KC_NO, KC_NO, KC_NO, KC_NO, KC_NO

#define ___NUMBER_R1___    KC_6, KC_7, KC_8, KC_9, KC_0
#define ___NUMBER_R2___    KC_NO, KC_NO, KC_NO, KC_NO, KC_NO
#define ___NUMBER_R3___    KC_NO, KC_NO, KC_NO, KC_NO, KC_NO

#define __NUMBER_LT__      KC_LSFT, KC_E
#define __NUMBER_RT__      KC_SPC,  KC_RSFT
