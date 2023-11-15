# Remove greeting
set -g fish_greeting

# Aliases
alias v="nvim"
alias vi="nvim"
alias vim="nvim"

alias ls="lsd"
alias tree="ls --tree"

alias conda="micromamba"

# >>> mamba initialize >>>
# !! Contents within this block are managed by 'mamba init' !!
set -gx MAMBA_EXE "/opt/homebrew/opt/micromamba/bin/micromamba"
set -gx MAMBA_ROOT_PREFIX "/Users/fpiedrah/micromamba"
$MAMBA_EXE shell hook --shell fish --root-prefix $MAMBA_ROOT_PREFIX | source
# <<< mamba initialize <<<

# Activate base env
micromamba activate
