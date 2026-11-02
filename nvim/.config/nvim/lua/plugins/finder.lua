-- File Finders
local FINDERS = { 'fd', vim.fn.expand('~/.pi/agent/bin/fd'), 'fdfind' }

-- Find Command
local function find_command(opts)
  local finder = vim.iter(FINDERS):find(function(candidate)
    return vim.fn.executable(candidate) == 1
  end) or 'fd'

  local command = { finder, '--type', 'f', '--hidden', '--color', 'never' }
  if opts.ignored then
    table.insert(command, '--no-ignore')
  end
  for _, pattern in ipairs(vim.list_extend({ '.git' }, opts.exclude or {})) do
    vim.list_extend(command, { '--exclude', pattern })
  end
  return command
end

-- Dotfiles Picker
local function find_dotfiles()
  require('telescope.builtin').find_files({
    prompt_title = 'Dotfiles',
    cwd = '~/Workspace/.configuration',
    ignored = true,
    exclude = { 'node_modules', '.pi/crew', '.pi/orchestra' },
  })
end

local function configuration()
  local telescope = require('telescope')

  telescope.setup({
    pickers = {
      find_files = { find_command = find_command },
    },
  })

  telescope.load_extension('fzf')
end

return {
  'nvim-telescope/telescope.nvim',
  cmd = 'Telescope',
  keys = {
    { '<leader>ff', '<cmd>Telescope find_files<CR>', desc = 'Find Files' },
    { '<leader>fg', '<cmd>Telescope live_grep<CR>', desc = 'Live Grep' },
    { '<leader>fb', '<cmd>Telescope buffers<CR>', desc = 'Find Buffers' },
    { '<leader>fd', find_dotfiles, desc = 'Find Dotfiles' },
  },
  dependencies = {
    'nvim-lua/plenary.nvim',
    'nvim-tree/nvim-web-devicons',
    { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
  },
  branch = 'master',
  config = configuration,
}
