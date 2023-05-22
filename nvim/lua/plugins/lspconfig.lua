local mason = require('mason')
local lspconfig = require('lspconfig')
local mason_lspconfig = require('mason-lspconfig')


mason.setup()
mason_lspconfig.setup {
  ensure_installed = {
    'pylsp',
    'lua_ls',
    'julials', 
  }
}

local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)

local get_servers = require('mason-lspconfig').get_installed_servers

for _, lsp in ipairs(get_servers()) do
  lspconfig[lsp].setup {
    capabilities = capabilities,
  }
end
