local servers = {
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

-- LSP Keymaps
local function on_attach(_, bufnr)
  local function map(lhs, rhs, desc)
    vim.keymap.set('n', lhs, rhs, { buffer = bufnr, silent = true, desc = 'LSP: ' .. desc })
  end

  map('gd', vim.lsp.buf.definition, 'Go to Definition')
  map('gD', vim.lsp.buf.declaration, 'Go to Declaration')
  map('gi', vim.lsp.buf.implementation, 'Go to Implementation')
  map('gr', vim.lsp.buf.references, 'List References')
  map('K', vim.lsp.buf.hover, 'Hover Documentation')
  map('<leader>k', vim.lsp.buf.signature_help, 'Signature Help')
  map('<leader>rn', vim.lsp.buf.rename, 'Rename Symbol')
  map('<leader>ca', vim.lsp.buf.code_action, 'Code Action')
  map('<leader>d', vim.diagnostic.open_float, 'Line Diagnostics')
  map('[d', function() vim.diagnostic.jump({ count = -1, float = true }) end, 'Previous Diagnostic')
  map(']d', function() vim.diagnostic.jump({ count = 1, float = true }) end, 'Next Diagnostic')
  map('<leader>lf', function() vim.lsp.buf.format({ async = true }) end, 'Format Buffer')
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
    ensure_installed = servers,
  })

  -- Diagnostics
  vim.diagnostic.config({
    virtual_text = true,
    severity_sort = true,
    float = { border = 'rounded', source = true },
  })

  -- Completion Capabilities
  local capabilities = require('cmp_nvim_lsp').default_capabilities()

  -- Shared Server Defaults
  vim.lsp.config('*', {
    capabilities = capabilities,
  })

  -- Leave Typst to tinymist
  vim.lsp.config('ltex_plus', {
    filetypes = vim.tbl_filter(function(ft)
      return ft ~= 'typst'
    end, vim.lsp.config.ltex_plus.filetypes),
  })

  vim.api.nvim_create_autocmd('LspAttach', {
    group = vim.api.nvim_create_augroup('lsp_attach', { clear = true }),
    callback = function(event)
      on_attach(vim.lsp.get_client_by_id(event.data.client_id), event.buf)
    end,
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
