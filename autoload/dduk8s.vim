function! dduk8s#setDetail(enable)
	call luaeval('require("dduk8s").setDetail(_A)', a:enable)
endfunction

function! dduk8s#toggleDetail()
	lua require('dduk8s').toggleDetail()
endfunction
