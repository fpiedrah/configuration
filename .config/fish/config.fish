# Remove Greeting
set -g fish_greeting

# Add Brew To Path
fish_add_path /opt/homebrew/bin
fish_add_path /Library/TeX/texbin

# Aliases
alias v="nvim"
alias vi="nvim"
alias vim="nvim"

alias ls="lsd"
alias tree="ls --tree"

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
if test -f /home/fpiedrah/.conda/bin/conda
    eval /home/fpiedrah/.conda/bin/conda "shell.fish" "hook" $argv | source
else
    if test -f "/home/fpiedrah/.conda/etc/fish/conf.d/conda.fish"
        . "/home/fpiedrah/.conda/etc/fish/conf.d/conda.fish"
    else
        set -x PATH "/home/fpiedrah/.conda/bin" $PATH
    end
end
# <<< conda initialize <<<

