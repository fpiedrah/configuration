local function map(mode, lhs, rhs, opts)
  local options = { noremap = true, silent = true }
  if opts then
    options = vim.tbl_extend('force', options, opts)
  end
  vim.api.nvim_set_keymap(mode, lhs, rhs, options)
end

-- Change leader to space
vim.g.mapleader = ' '

-- SINTHAR mappings
map('n', 't', 'h')
map('n', 'h', 'j')
map('n', 'a', 'k')
map('n', 'r', 'l')

map('v', 't', 'h')
map('v', 'h', 'j')
map('v', 'a', 'k')
map('v', 'r', 'l')

map('n', 'j', 'h')
map('n', 'k', 'a')
map('n', 'l', 'r')

map('v', 'j', 'h')
map('v', 'k', 'a')
map('v', 'l', 'r')

-- General
map('n', '<leader>qq', ':q!<CR>')

-- Disable arrow keys
map('', '<up>', '<nop>')
map('', '<down>', '<nop>')
map('', '<left>', '<nop>')
map('', '<right>', '<nop>')

-- Clear search highlighting
map('n', '<leader>c', ':nohl<CR>')

-- Splits
map('n', '<leader>wo', '<C-w>n')
map('n', '<leader>wv', '<C-w>v')

map('n', '<leader>wt', '<C-w>h')
map('n', '<leader>wh', '<C-w>j')
map('n', '<leader>wa', '<C-w>k')
map('n', '<leader>wr', '<C-w>l')
map('n', '<leader>wc', ':q<CR>')

-- Tabs
map('n', '<leader>tt', ':tabnew<CR>')
map('n', '<leader>tn', ':tabnext<CR>')
map('n', '<leader>tp', ':tabprevious<CR>')
map('n', '<leader>tl', ':tablast<CR>')
map('n', '<leader>tf', ':tabfirst<CR>')
map('n', '<leader>tc', ':tabclose<CR>')

-- Reload configuration without restart nvim
map('n', '<leader>r', ':so %<CR>')

-- Fast saving with <leader> and s
map('n', '<leader>s', ':w<CR>')
map('n', '<leader>ss', ':x<CR>')

-- Close all windows and exit from Neovim with <leader> and q
map('n', '<leader>q', ':qa!<CR>')

-- Telescope mappings
map('n', '<leader>ff', ':Telescope find_files<CR>')
map('n', '<leader>fg', ':Telescope live_grep<CR>')
map('n', '<leader>fb', ':Telescope buffers<CR>')

-- LuaSnip mappings
map('i', '<c-j>', "<cmd>lua require'luasnip'.jump(1)<CR>")
map('s', '<c-j>', "<cmd>lua require'luasnip'.jump(1)<CR>")
map('i', '<c-k>', "<cmd>lua require'luasnip'.jump(-1)<CR>")
map('s', '<c-k>', "<cmd>lua require'luasnip'.jump(-1)<CR>")

-- Hop mappings
map('n', '<leader>hh', ':HopWord<CR>')
