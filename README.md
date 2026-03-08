# configuration

Personal dotfiles managed with GNU Stow.

This repo contains my daily shell, editor, terminal, and Hyprland desktop configuration.

## Included

- `nvim` - Neovim setup with `lazy.nvim` and plugin-based config
- `fish` - shell aliases, paths, and interactive shell settings
- `tmux` - custom prefix, pane navigation, and TPM plugins
- `kitty` - terminal settings and theme include
- `hypr` - Hyprland, Hyprpaper, and Hyprlock config
- `waybar` - top bar layout and modules
- `wofi` - launcher config
- `lsd` - `lsd` defaults

## Install

Clone the repo, then symlink it into your home directory with Stow.

```sh
git clone <your-repo-url> ~/configuration
cd ~/configuration
stow --target="$HOME" .
```

## Notes

- This setup is primarily tailored for a Linux/Hyprland environment.
- Some config values are machine-specific and may need small local adjustments.
