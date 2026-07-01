# configuration

## Install

```sh
git clone git@github.com:fpiedrah/configuration.git ~/configuration
cd ~/configuration

stow --target="$HOME" \
  nvim \
  zsh \
  tmux \
  kitty \
  hypr \
  waybar \
  wofi \
  lsd
```

## Dependencies

```sh
# CLI tools on conda-forge
pixi global install \
  stow \
  nvim \
  tmux \
  zsh \
  fish \
  kitty \
  rust \
  nodejs

# not on conda-forge, build via cargo
cargo install lsd

# Waybar/Wofi ship in Fedora's repos; Hyprland needs a COPR
sudo dnf install waybar wofi
sudo dnf copr enable solopasha/hyprland
sudo dnf install hyprland

# Oh My Zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Powerlevel10k theme
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git \
  "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"

# zsh plugins
git clone https://github.com/zsh-users/zsh-autosuggestions \
  "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions"

git clone https://github.com/zsh-users/zsh-syntax-highlighting.git \
  "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting"

# tmux plugin manager (install plugins with prefix + I after)
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

