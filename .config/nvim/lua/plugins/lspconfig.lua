local servers = {
  'clangd',
  'dockerls',
  'jsonls',
  'julials',
  'lemminx',
  'ltex',
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

-- Buffer-local keymaps, set once an LSP client attaches to a buffer.
local function on_attach(_, bufnr)
  local function map(lhs, rhs, desc)
    vim.keymap.set('n', lhs, rhs, { buffer = bufnr, silent = true, desc = 'LSP: ' .. desc })
  end

  map('gd', vim.lsp.buf.definition, 'Go to definition')
  map('gD', vim.lsp.buf.declaration, 'Go to declaration')
  map('gi', vim.lsp.buf.implementation, 'Go to implementation')
  map('gr', vim.lsp.buf.references, 'List references')
  map('K', vim.lsp.buf.hover, 'Hover documentation')
  map('<leader>k', vim.lsp.buf.signature_help, 'Signature help')
  map('<leader>rn', vim.lsp.buf.rename, 'Rename symbol')
  map('<leader>ca', vim.lsp.buf.code_action, 'Code action')
  map('<leader>d', vim.diagnostic.open_float, 'Line diagnostics')
  map('[d', function() vim.diagnostic.jump({ count = -1, float = true }) end, 'Previous diagnostic')
  map(']d', function() vim.diagnostic.jump({ count = 1, float = true }) end, 'Next diagnostic')
  map('<leader>lf', function() vim.lsp.buf.format({ async = true }) end, 'Format buffer')
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

  -- Diagnostics presentation.
  vim.diagnostic.config({
    virtual_text = true,
    severity_sort = true,
    float = { border = 'rounded', source = true },
  })

  -- Capabilities advertised to every server (adds nvim-cmp completion support).
  local capabilities = require('cmp_nvim_lsp').default_capabilities()

  -- Apply shared defaults to all servers; mason-lspconfig enables them automatically.
  vim.lsp.config('*', {
    capabilities = capabilities,
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
