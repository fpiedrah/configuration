local function map(mode, lhs, rhs, opts)
  local options = { noremap = true, silent = true }
  if opts then
    options = vim.tbl_extend('force', options, opts)
  end
  vim.api.nvim_set_keymap(mode, lhs, rhs, options)
end

-- Change leader to space
vim.g.mapleader = ' '

-- Clear search highlighting
map('n', '<leader>c', ':nohl<CR>')

-- Splits
map('n', '<leader>wo', '<C-w>n')
map('n', '<leader>we', '<C-w>v')
map('n', '<leader>wt', ':vert term<CR>')

map('n', '<leader>wh', '<C-w>h')
map('n', '<leader>wj', '<C-w>j')
map('n', '<leader>wk', '<C-w>k')
map('n', '<leader>wl', '<C-w>l')
map('n', '<leader>wx', '<C-w>c')

-- Fast saving with <leader> and s
map('n', '<leader>s', ':w<CR>')

-- Close all windows and exit from Neovim with <leader> and q
map('n', '<leader>x', ':qa!<CR>')

-- Terminal mappings
map('n', '<leader>t', ':terminal<CR>', { noremap = true })
map('t', '<Esc>', '<C-\\><C-n>')
map('t', 'fd', '<C-\\><C-n>')

-- Telescope mappings
map('n', '<leader>ff', ':Telescope find_files<CR>')
map('n', '<leader>fg', ':Telescope live_grep<CR>')
map('n', '<leader>fb', ':Telescope buffers<CR>')

-- Hop mappings
map('n', '<leader>hh', ':HopWord<CR>')
