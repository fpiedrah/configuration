
# Thin Neovim Config

Welcome to the Thin Neovim Config project! This is a lightweight, Lua-based configuration for the Neovim text editor. The project consists of the core Neovim settings, key mappings, auto commands and several utility plugins that provide powerful text editing features such as auto-completion, syntax highlighting, code snippets, and more.

## Structure

The configuration files for Neovim and the plugins are located in the `lua` directory.

- `init.lua` - The main Neovim configuration file.
- `lua/core` - Contains core configuration files:
  - `autocmds.lua` - Defines auto-commands.
  - `keymaps.lua` - Contains custom key mappings.
  - `options.lua` - Sets Neovim options.
- `lua/installer.lua` - Handles plugin installation.
- `lua/plugins` - Contains plugin configuration files.

## Plugins

This configuration uses the following plugins, managed by [Packer](https://github.com/wbthomason/packer.nvim):

- [Treesitter](https://github.com/nvim-treesitter/nvim-treesitter) for improved syntax highlighting.
- [LSP](https://github.com/neovim/nvim-lspconfig) for language server support.
- [LuaSnip](https://github.com/L3MON4D3/LuaSnip) and [friendly-snippets](https://github.com/rafamadriz/friendly-snippets) for code snippets.
- [nvim-cmp](https://github.com/hrsh7th/nvim-cmp) for autocomplete.
- [nvim-autopairs](https://github.com/windwp/nvim-autopairs) for automatic pairing of brackets and quotes.
- [Onedark.nvim](https://github.com/navarasu/onedark.nvim) for color scheme.
- [Telescope.nvim](https://github.com/nvim-telescope/telescope.nvim) for searching and picking.
- [Lualine.nvim](https://github.com/nvim-lualine/lualine.nvim) for status line.
- [Hop.nvim](https://github.com/phaazon/hop.nvim) for quick navigation.

## Installation

1. Make sure you have Neovim (v0.5 or later) installed. You can check this with `nvim --version`.

2. Clone this repository into your Neovim configuration directory. On Unix-like systems, this is `~/.config/nvim/`.

   ```bash
   git clone https://github.com/fpiedrah/configuration.git
   cp ./configuration/nvim ~/.config/nvim
   ```

3. Open Neovim and run :PackerInstall. This will install all the plugins.

## Usage

Simply start Neovim (nvim) and enjoy your new configuration!
