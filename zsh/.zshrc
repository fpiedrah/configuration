# Powerlevel10k Instant Prompt
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Oh My Zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
plugins=(
  git
  zsh-autosuggestions
  zsh-syntax-highlighting
)
source $ZSH/oh-my-zsh.sh

# Deduplicate PATH
typeset -U path PATH

export PATH="$HOME/.local/bin:$PATH"

# Pixi
[[ -d "$HOME/.pixi/bin" ]] && export PATH="$HOME/.pixi/bin:$PATH"

# Terminal Title
ZSH_THEME_TERM_TITLE_IDLE='%1~'
ZSH_THEME_TERM_TAB_TITLE_IDLE='%1~'

# Exports
command -v npm >/dev/null && export PATH="$(npm prefix -g)/bin:$PATH"

# Home-Backed TMPDIR
export TMPDIR="$HOME/.tmp"
[[ -d "$TMPDIR" ]] || mkdir -p "$TMPDIR"

# Aliases
alias ls="lsd -l --group-dirs first --permission disable --blocks name,size"
alias tree="ls --tree"

alias v="nvim"
alias vi="nvim"
alias vim="nvim"

# Ctrl+Backspace Deletes Word
bindkey '^H' backward-kill-word

# Cargo Binaries
export PATH="$HOME/.cargo/bin:$PATH"

# Powerlevel10k Config
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# Conda
for __conda_root in "$HOME/.conda" "$HOME/.anaconda"; do
  [[ -x "$__conda_root/bin/conda" ]] || continue
  __conda_setup="$("$__conda_root/bin/conda" 'shell.zsh' 'hook' 2> /dev/null)"
  if [ $? -eq 0 ]; then
      eval "$__conda_setup"
  elif [ -f "$__conda_root/etc/profile.d/conda.sh" ]; then
      . "$__conda_root/etc/profile.d/conda.sh"
  else
      export PATH="$__conda_root/bin:$PATH"
  fi
  break
done
unset __conda_root __conda_setup

# opencode
[[ -d "$HOME/.opencode/bin" ]] && export PATH="$HOME/.opencode/bin:$PATH"
