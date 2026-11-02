local SERVERS = {
  'clangd',
  'dockerls',
  'jsonls',
  'julials',
  'lemminx',
  'ltex_plus',
  'lua_ls',
  'marksman',
  'ruff',
  'rust_analyzer',
  'sqlls',
  'taplo',
  'tinymist',
  'ty',
  'yamlls',
  'zls',
}

-- Buffer Keymaps
local function attach(event)
  local function map(lhs, rhs, desc)
    vim.keymap.set('n', lhs, rhs, { buffer = event.buf, silent = true, desc = 'LSP: ' .. desc })
  end

  map('gd', vim.lsp.buf.definition, 'Go to Definition')
  map('gD', vim.lsp.buf.declaration, 'Go to Declaration')
  map('<leader>d', vim.diagnostic.open_float, 'Line Diagnostics')
  map('<leader>lf', function()
    vim.lsp.buf.format({ async = true })
  end, 'Format Buffer')
end

-- Float on Diagnostic Jump
local function open_diagnostic_float(_, buffer)
  vim.diagnostic.open_float({ bufnr = buffer, scope = 'cursor', focus = false })
end

local function configuration()
  require('mason').setup({
    ui = {
      icons = {
        package_installed = '✓',
        package_pending = '➜',
        package_uninstalled = '✗',
      },
    },
  })

  require('mason-lspconfig').setup({
    ensure_installed = SERVERS,
  })

  -- Diagnostics
  vim.diagnostic.config({
    virtual_text = true,
    severity_sort = true,
    float = { border = 'rounded', source = true },
    jump = { on_jump = open_diagnostic_float },
  })

  -- Shared Server Defaults
  vim.lsp.config('*', {
    capabilities = require('cmp_nvim_lsp').default_capabilities(),
  })

  -- Leave Typst to Tinymist
  vim.lsp.config('ltex_plus', {
    filetypes = vim.tbl_filter(function(filetype)
      return filetype ~= 'typst'
    end, vim.lsp.config.ltex_plus.filetypes),
  })

  vim.api.nvim_create_autocmd('LspAttach', {
    group = vim.api.nvim_create_augroup('lsp_attach', { clear = true }),
    callback = attach,
  })
end

return {
  'neovim/nvim-lspconfig',
  event = { 'BufReadPre', 'BufNewFile' },
  dependencies = {
    'hrsh7th/cmp-nvim-lsp',
    'williamboman/mason.nvim',
    'williamboman/mason-lspconfig.nvim',
  },
  config = configuration,
}
