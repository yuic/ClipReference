const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import('resource://gre/modules/Services.jsm');

// for share variables between the browser windows, the preference window and here
var scopes = {};
var dummyN = function(){};

var StyleSheetRegister = {
	getServices: function(){
		var iios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		return {
			sss: Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService),
			ios: iios,
			uri: iios.newURI("chrome://clipreference/content/clipreference.css", null, null)
		};
	},

	register: function(){
		var {sss, ios, uri} = this.getServices();
		if(!sss.sheetRegistered(uri, sss.USER_SHEET)) sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
	},
	unregister: function(){
		var {sss, ios, uri} = this.getServices();
		if(sss.sheetRegistered(uri, sss.USER_SHEET)) sss.unregisterSheet(uri, sss.USER_SHEET);
	}
};

// load scripts into scope and initialize Clips when open new browser window
function loadIntoWindow(window){
	Cu.import('chrome://clipreference/content/storage.jsm');
	var scope = { Cc : Cc, Ci : Ci, Cu : Cu, window : window, document : window.document };
	['util.js', 'webLoader.js', 'uiGener.js', 'clip.js', 'clipManager.js'].forEach( function(mod){
		Services.scriptloader.loadSubScript('chrome://clipreference/content/' + mod, scope, 'utf-8'); });
	var uniqueKey = new Date().getTime().toString();
	scope.ClipManager.init(uniqueKey);
	scopes[uniqueKey] = scope;
	StyleSheetRegister.register();
};

var windowListener = {
	onOpenWindow: function(aWindow) {
		let win = this.T(aWindow);
		win.addEventListener('load', function() {
			win.removeEventListener('load', arguments.callee, false);
			if( !windowListener.isBrowser(win) ) return;

			// for when open the 2nd browser window without init clips on 1st browser window
			// if this put in "loadIntoWindow", "DB.createTables()" will be running when the first browser window was opened
			Cu.import('chrome://clipreference/content/storage.jsm');
			DB.init();
			for(var s in scopes) scopes[s].ClipManager.loadAppData();
			loadIntoWindow(win);
		}, false);
	},

	onCloseWindow : function(aWindow){
		let win = this.T(aWindow);
		win.addEventListener('unload', function() {
			win.removeEventListener('unload', arguments.callee, false);
			if( !windowListener.isBrowser(win) ) return;

			let $ = function(id){ return win.document.getElementById(id); };
			delete scopes[ $('appcontent').removeChild( $('CLRF_unique') ).getAttribute('value') ];
			for(var s in scopes) scopes[s].ClipManager.loadAppData();
		}, false);
	},
	onWindowTitleChange : dummyN,
	T: function(win){ return win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow); },
	isBrowser: function(win){ return win.document.documentElement.getAttribute('windowtype') === 'navigator:browser'; }
};

function attachDbFile(){
	var file = Services.dirsvc.get('ProfD', Ci.nsIFile);
		file.append('clipreference.sqlite');
	return file;
};

function startup(params, reason){
	let windows = Services.wm.getEnumerator('navigator:browser');
	while (windows.hasMoreElements()) loadIntoWindow(windows.getNext().QueryInterface(Ci.nsIDOMWindow));
	Services.wm.addListener(windowListener);
};

function shutdown(params, reason){
	StyleSheetRegister.unregister();
	for(var s in scopes) scopes[s].ClipManager.shutdown();
	scopes = null;
	Services.wm.removeListener(windowListener);
	Cu.unload('chrome://clipreference/content/storage.jsm');
};

function uninstall(params, reason){
	if(reason === ADDON_UNINSTALL) attachDbFile().remove(false);
};

function install(params, reason){
	if(reason !== ADDON_UPGRADE) return;

	var file = attachDbFile();
	var conn = Services.storage.openDatabase(file);
		conn.executeSimpleSQL("INSERT INTO 'pref' VALUES('toolDir','2');");
		conn.close();
	file = conn = null;
};

