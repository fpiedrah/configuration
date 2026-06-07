-- Leader keys must be set before plugins load so mappings register correctly.
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

require('core.options')
require('core.keymaps')
require('core.autocmds')

require('manager')
