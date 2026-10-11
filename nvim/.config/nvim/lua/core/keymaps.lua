-- Keymap Helper
local function map(mode, lhs, rhs, opts)
  opts = vim.tbl_extend('force', { noremap = true, silent = true }, opts or {})
  vim.keymap.set(mode, lhs, rhs, opts)
end

-- Clear Search Highlighting
map('n', '<leader>c', '<cmd>nohlsearch<CR>', { desc = 'Clear Search Highlight' })

-- Window Focus
map('n', '<leader>wh', '<C-w>h', { desc = 'Go to Left Window' })
map('n', '<leader>wj', '<C-w>j', { desc = 'Go to Lower Window' })
map('n', '<leader>wk', '<C-w>k', { desc = 'Go to Upper Window' })
map('n', '<leader>wl', '<C-w>l', { desc = 'Go to Right Window' })

-- Window Move
map('n', '<leader>wH', '<C-w>H', { desc = 'Move Window Left' })
map('n', '<leader>wJ', '<C-w>J', { desc = 'Move Window Down' })
map('n', '<leader>wK', '<C-w>K', { desc = 'Move Window Up' })
map('n', '<leader>wL', '<C-w>L', { desc = 'Move Window Right' })

-- Splits
map('n', '<leader>ws', '<C-w>s', { desc = 'Split Below' })
map('n', '<leader>wv', '<C-w>v', { desc = 'Split Vertically' })
map('n', '<leader>wt', '<cmd>vert term<CR>', { desc = 'Vertical Terminal Split' })

-- Window Close / Fullscreen
map('n', '<leader>wq', '<C-w>q', { desc = 'Close Window' })
map('n', '<leader>wf', '<C-w>_<C-w>|', { desc = 'Fullscreen Window' })
map('n', '<leader>w=', '<C-w>=', { desc = 'Equalize Windows' })

-- Save / Quit
map('n', '<leader>s', '<cmd>write<CR>', { desc = 'Save File' })
map('n', '<leader>Q', '<cmd>qa<CR>', { desc = 'Quit All' })

-- Terminal
map('n', '<leader>t', '<cmd>terminal<CR>', { desc = 'Open Terminal' })
map('t', '<Esc>', '<C-\\><C-n>', { desc = 'Terminal: Exit to Normal Mode' })
map('t', 'fd', '<C-\\><C-n>', { desc = 'Terminal: Exit to Normal Mode' })

-- Escape with fd
map('i', 'fd', '<Esc>', { desc = 'Exit Insert Mode' })
map('v', 'fd', '<Esc>', { desc = 'Exit Visual Mode' })

-- Ctrl+Backspace Deletes Word
map('i', '<C-BS>', '<C-w>', { desc = 'Delete Word Backward' })
map('i', '<C-h>', '<C-w>', { desc = 'Delete Word Backward' })

-- Telescope
map('n', '<leader>ff', '<cmd>Telescope find_files<CR>', { desc = 'Find Files' })
map('n', '<leader>fg', '<cmd>Telescope live_grep<CR>', { desc = 'Live Grep' })
map('n', '<leader>fb', '<cmd>Telescope buffers<CR>', { desc = 'Find Buffers' })

-- Hop
map('n', '<leader>hh', '<cmd>HopWord<CR>', { desc = 'Hop to Word' })

-- Oil
map('n', '<leader>oo', '<cmd>Oil<CR>', { desc = 'Open Parent Directory (Oil)' })
