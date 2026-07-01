# Enable Powerlevel10k instant prompt (must stay near the top).
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

# Exports
export PATH="$(npm prefix -g)/bin:$PATH"

# Use home-backed scratch instead of the shared, often-full root /tmp
export TMPDIR="$HOME/.tmp"
[[ -d "$TMPDIR" ]] || mkdir -p "$TMPDIR"

# Aliases
alias ls="lsd -l --group-dirs first --permission disable --blocks name,size"
alias tree="ls --tree"

alias v="nvim"
alias vi="nvim"
alias vim="nvim"

# Rust/cargo-installed binaries (e.g. lsd)
export PATH="$HOME/.cargo/bin:$PATH"

# Powerlevel10k prompt config (run `p10k configure` to regenerate)
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('$HOME/.anaconda/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "$HOME/.anaconda/etc/profile.d/conda.sh" ]; then
        . "$HOME/.anaconda/etc/profile.d/conda.sh"
    else
        export PATH="$HOME/.anaconda/bin:$PATH"
    fi
fi
unset __conda_setup
# <<< conda initialize <<<

# opencode
export PATH="$HOME/.opencode/bin:$PATH"
