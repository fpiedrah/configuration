-- Thin wrapper around vim.keymap.set with sensible defaults.
local function map(mode, lhs, rhs, opts)
  opts = vim.tbl_extend('force', { noremap = true, silent = true }, opts or {})
  vim.keymap.set(mode, lhs, rhs, opts)
end

-- Clear search highlighting
map('n', '<leader>c', '<cmd>nohlsearch<CR>', { desc = 'Clear search highlight' })

-- Splits
map('n', '<leader>wo', '<C-w>n', { desc = 'New split' })
map('n', '<leader>we', '<C-w>v', { desc = 'Split vertically' })
map('n', '<leader>wt', '<cmd>vert term<CR>', { desc = 'Vertical terminal split' })

map('n', '<leader>wh', '<C-w>h', { desc = 'Go to left window' })
map('n', '<leader>wj', '<C-w>j', { desc = 'Go to lower window' })
map('n', '<leader>wk', '<C-w>k', { desc = 'Go to upper window' })
map('n', '<leader>wl', '<C-w>l', { desc = 'Go to right window' })
map('n', '<leader>wx', '<C-w>c', { desc = 'Close window' })

-- Save / quit
map('n', '<leader>s', '<cmd>write<CR>', { desc = 'Save file' })
map('n', '<leader>x', '<cmd>qa!<CR>', { desc = 'Quit all (no save)' })

-- Terminal
map('n', '<leader>t', '<cmd>terminal<CR>', { desc = 'Open terminal' })
map('t', '<Esc>', '<C-\\><C-n>', { desc = 'Terminal: exit to normal mode' })
map('t', 'fd', '<C-\\><C-n>', { desc = 'Terminal: exit to normal mode' })

-- Telescope
map('n', '<leader>ff', '<cmd>Telescope find_files<CR>', { desc = 'Find files' })
map('n', '<leader>fg', '<cmd>Telescope live_grep<CR>', { desc = 'Live grep' })
map('n', '<leader>fb', '<cmd>Telescope buffers<CR>', { desc = 'Find buffers' })

-- Hop
map('n', '<leader>hh', '<cmd>HopWord<CR>', { desc = 'Hop to word' })

-- Oil
map('n', '<leader>oo', '<cmd>Oil<CR>', { desc = 'Open parent directory (Oil)' })
