# Remove Greeting
set -g fish_greeting

# Add Brew To Path
fish_add_path /opt/homebrew/bin

# Aliases
alias v="nvim"
alias vi="nvim"
alias vim="nvim"

alias ls="lsd"
alias tree="ls --tree"

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
if test -f /Users/fpiedrah/.anaconda/bin/conda
  eval /Users/fpiedrah/.anaconda/bin/conda "shell.fish" "hook" $argv | source
end
# <<< conda initialize <<<
