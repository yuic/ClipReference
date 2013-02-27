var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import('resource://gre/modules/Services.jsm');
//var log = loger('      P ');

var Pref = {
	userAcceptWin: false,
	cmdItems: null,
	ICON_DEL_GLAY	: 'chrome://clipreference/content/icon/deleteG.ico',
	ICON_DEL_RED	: 'chrome://clipreference/content/icon/deleteR.ico',
	ICON_LOCKED		: 'chrome://clipreference/content/icon/locked_g.ico',
	ICON_UNLOCK		: 'chrome://clipreference/content/icon/unlock_g.ico',

	// ブラウザウィンドウのClip向けにイベントを発火しClipインスタンス上の尺度データをDBに反映
	// その後、DBから値取得して設定画面へ展開
	load: function(){
		Pref.dataLoad();
		$('cmdtree').view = treeView;

		// 'input'とか'change'だと値を変えてからツリーをいじった時に、発火が間に合わない
		['keyup', 'change', 'command'].forEach( function(ev){
			$('detailArea').addEventListener(ev, function(e){ Pref.itemChanged(e) }, false);
		});
	},

	unload: function(){
		if( $isCommittable(Pref.userAcceptWin) ){
			// 共通設定用データを収集しprefを更新
			var prefs = [];
			PrefsKeysAll.forEach( function(e, i){
				( e[2] ) ? prefs[i] = [ e[1], ( ($(e[0]).checked)?1:0 ) ]
						 : prefs[i] = [ e[1],    $(e[0]).value ];
			} );
			DB.updatePrefs(prefs);
			DB.updateClipData( Pref.prepareItems() );	// ツリー用データを収集しcommandを更新
			Pref.notifyUpdated();						// 編集終了のお知らせ
		}
		Pref.cmdItems = undefined;
		DB.destroy();
	},

	// 開いてる全gBrowserに設定が変更されたことを通知する
	notifyUpdated: function(){
		let wins = Services.wm.getEnumerator('navigator:browser');
		while (wins.hasMoreElements()){
			var dtpanel = wins.getNext().QueryInterface(Ci.nsIDOMWindow).document.getElementById('CLRF_dtpanel');
			if(dtpanel) dtpanel.dispatchEvent( new CustomEvent("prefclose") );
		}
	},

	// 設定画面に放り込むデータの収集
	dataLoad: function(){
		DB.init();
		// テーブルprefをロードして画面に注入
		var prefs = DB.getPrefs();
		PrefsKeysAll.forEach( function(e){
			( e[2] ) ? $( e[0] ).checked = (prefs[ e[1] ] === e[2])
					 : $( e[0] ).value   =  prefs[ e[1] ]
		} );

		// テーブルcommandをロードしてtreeに注入
		// この時点でdelete button, no image, explain itemを充填しておく
		Pref.cmdItems = DB.getDetailData();
		Pref.fillIconGlay();
		Pref.appendExplainItem();
	},

	fillIconGlay: function(){
		for(var i=0, j=Pref.cmdItems.length; i<j; i++) Pref.cmdItems[i].delete = Pref.ICON_DEL_GLAY;
	},

	// cast menuItems for insert db
	prepareItems: function(){
		var rArray = [];
		for(var i=newId=0, iLim=Pref.cmdItems.length-1; i<iLim; i++){				// delete row: explain item
			var e = Pref.cmdItems[i];
			if(!e.url_script) continue;												// delete row: url field is undefined
			rArray.push([ newId++, e.name, e.isScript, e.url_script, e.xpath,		// renumber command.id
				e.width, e.height, e.posX_def, e.posY_def, e.posX_min, e.posY_min,
				e.defaultPin, e.defaultSync, e.defaultZoom, e.favicon ]);			// delete col: delete button
		}
		return rArray;
	},

	// set icon manually from local directory. display filepicker and convert image to base64
	loadLocalIcon : function(){
		var nsIFilePicker = Ci.nsIFilePicker;
		var fp = Cc['@mozilla.org/filepicker;1'].createInstance(nsIFilePicker);
			fp.appendFilter($LOCALE('pref.fileKind.icon'),'*.ico');
			fp.appendFilters(nsIFilePicker.filterAll);
			fp.init(window, $LOCALE('pref.filepicker.title'), nsIFilePicker.modeOpen);
		var res = fp.show();

		if(res !== nsIFilePicker.returnOK) return;

		var fileStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
			fileStream.init(fp.file, -1, -1, false);
		var binaryStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
			binaryStream.setInputStream(fileStream);
		var bytes = binaryStream.readBytes(fileStream.available());
			binaryStream.close();
			fileStream.close();
		return ('data:image/x-icon;base64,' + btoa(bytes));
	},

	// get favicon by given url
	getFavicon: function (row, url) {
		if(!url) return;
		try{
			var reqHTML = new XMLHttpRequest();
			reqHTML.open( 'GET', url.replace(/<.*>/g, '') );
			reqHTML.responseType = 'document';
			reqHTML.onload = function(){
				var iconUrls = Pref.extractFaviconUrls(reqHTML);
					iconUrls.push(url.match(/http(s*):\/\/.*?\//g) + 'favicon.ico');
				Pref.loadFavicon(iconUrls, 0, row);
			}
			reqHTML.send();
		} catch(e){ /*log(e);*/ }	// mainly, edit 'URL/SCRIPT' field when unchecked 'SCRIPT?' field
	},

	// try to obtain favicon url from link tag in html page.
	// ignore the second definition.
	extractFaviconUrls: function(req){
		if(req.status !== 200) return;
		var urlArray = [], iconNode;
		['/html/head/link[@rel="shortcut icon"]', '/html/head/link[@rel="icon"]'].forEach(function(elm){
			if(iconNode = $evaluateXPath(req.responseXML, elm)[0]) urlArray.push( iconNode.href );
		});
		return urlArray;
	},

	loadFavicon: function(urls, idx, row){
		if(urls.length-1 < idx) {
			Pref.notify( 'boxNotifyM', 'warning', $LOCALE('pref.notify.iconnotfound') );
			return;
		}

		var reqIcon = new XMLHttpRequest();
		reqIcon.open('GET', urls[idx]);
		reqIcon.overrideMimeType('text/plain; charset=x-user-defined');
		reqIcon.onload = function(){
			if( reqIcon.status === 200 ) {
				Pref.cmdItems[row].favicon = Pref.convert2DataUri(reqIcon);
				treeView.treebox.invalidate();
				return;
			}
			Pref.loadFavicon(urls, idx+1, row);
		}
		reqIcon.send();
	},

	// from XMLHttpRequest(response) object to data uri
	convert2DataUri: function(req){
		for( var res=req.responseText, bytearray=[], i=0, l=res.length; i<l; bytearray[i]=res.charCodeAt(i) &0xff, i++ );
		return 'data:' + req.getResponseHeader('Content-Type') + ';base64,' + btoa( String.fromCharCode.apply(String, bytearray) );
	},

	// 
	notify: function(elm, type, msg){
		var notifyBox = $(elm);
		var notification = notifyBox.appendNotification(msg);
		notification.type = type;
		setTimeout(function() { notifyBox.removeCurrentNotification(); }, 6000);
	},

	appendExplainItem: function(){
		Pref.cmdItems.push( {
			url_script : $LOCALE('pref.treeview.howtoappend'),
			id         : 0, name      : '', favicon    : null,
			isScript   : 0, xpath     : '', width      : 480 , height   : 300,
			posX_def   : 0, posY_def  : 0 , posX_min   : 0   , posY_min : 0,
			defaultSync: 0, defaultPin: 0 , defaultZoom: 100
		} );
	},

	isReady2Restore: false,
	// guard restore button from wrong operation
	guardRestore: function(e){
		Pref.isReady2Restore = $('restoreGuard').getAttribute('checked')?0:1;	// avoid 'undefined' and it became 'NaN'
		$('restoreBtn').image = [Pref.ICON_LOCKED, Pref.ICON_UNLOCK][Pref.isReady2Restore];	// will locked
	},

	// restore the default settings. fire create database
	doRestore:function(e){
		if( !Pref.isReady2Restore || e.target.id !== 'restoreBtn' ) return;
		var tree = treeView.treebox;
		tree.rowCountChanged(1, -(Pref.cmdItems.length-1) );
		DB.createTables();
		Pref.dataLoad();
		Pref.notifyUpdated();
		tree.rowCountChanged(1,   Pref.cmdItems.length-1  );
		tree.invalidate();

		$('restoreGuard').setAttribute('checked', true);
		$('restoreBtn').image = Pref.ICON_LOCKED;
		Pref.isReady2Restore = false;

		Pref.notify('boxNotifyG', 'info', $LOCALE('pref.notify.restorefinished'));
	},

	// 詳細ペインの表示表示切替え ／ ターゲット中項目の値を初期表示
	switchDetail: function(e){
		var detailArea = $('detailArea');
		detailArea.collapsed = e.target.getAttribute('checked');
		e.target.image = 'chrome://global/skin/icons/' + ((detailArea.collapsed) ? 'collapse.png' : 'expand.png');
		if(treeView.selection.currentIndex>-1) Pref.itemSelected(null);
	},

	// ツリー上で選択項目を変更した時のハンドラ
	// 詳細ペインが表示されていれば、選択されたレコードの値を載せる
	itemSelected: function(e){
		if( $('detailArea').collapsed ) return;

		var currentItem = Pref.cmdItems[treeView.selection.currentIndex];
		// 共通フィールドへの値供給
		var cmmField = ['posX_min', 'posY_min'];
		for(let i=0, iLim=cmmField.length; i<iLim; i++) $( cmmField[i] ).value = currentItem[ VIEW_COL_MAP[cmmField[i]] ];

		// 個別フィールドへの値供給
		// また、ユーザスクリプトの項目はいくつかの項目をdisabledにする
		var defField = ['defaultSync', 'defaultPin'];
 		var switchFunc = (currentItem.isScript === 1)
			? function(elm){ $(elm).disabled = true ; $(elm).value = '' }
			: function(elm){
				$(elm).disabled = false;
				( defField.indexOf(elm) > -1 ) ? $(elm).checked = ( currentItem[ VIEW_COL_MAP[elm] ] === 1 )
											   : $(elm).value   =   currentItem[ VIEW_COL_MAP[elm] ];
			  };
		['xpath', 'width', 'height', 'posX_def', 'posY_def', 'defaultZoom'].concat(defField).forEach(switchFunc);
		Pref.switchZoomDisable();
	},

	// 詳細ペインが変更された／cmdItemsに変更を反映
	itemChanged: function(e){
		var curIdx = treeView.selection.currentIndex;
		if(curIdx<0) return;
		Pref.cmdItems[curIdx][ VIEW_COL_MAP[e.target.id] ] = ( e.target.value || (e.target.checked?1:0) );
		if(e.target.id === 'xpath'){
			Pref.cmdItems[curIdx][ VIEW_COL_MAP[e.target.id] ] = e.target.value;
			Pref.switchZoomDisable();
		}
	},

	// xpathの入力状況によってzoomのdisabledを切り替え
	switchZoomDisable: function(){
		var curIdx = treeView.selection.currentIndex;
		if(curIdx<0) return;
		$('defaultZoom').disabled = ( $('xpath').value.length > 0 || Pref.cmdItems[curIdx].isScript === 1 );
	},

	// to disable 'openTabActivate' when 'tabOpenPos' is changed
	tabOpenPosChanged: function(e){
		var T = e.target;
		$('openTabActivate' + T.id.charAt(T.id.length-1)).disabled = !(T.value === '2' || T.value === '3');
	},

};


// associate field-id with db-column name
var VIEW_COL_MAP = {
	icon        : 'favicon'    , name        : 'name'       , isScript : 'isScript', url        : 'url_script',
	posX_min    : 'posX_min'   , posY_min    : 'posY_min'   , posX_def : 'posX_def', posY_def   : 'posY_def',
	xpath       : 'xpath'      , width       : 'width'      , height   : 'height'  , defaultPin : 'defaultPin',
	defaultSync : 'defaultSync', defaultZoom : 'defaultZoom', delete   : 'delete'
};

var treeView = {
	// initialise & terminate tree
	setTree: function(treebox){ (treebox) ? this.treebox = treebox : Pref.cmdItems = undefined; },

	get rowCount() { return Pref.cmdItems.length; },

	getCellText : function(row,col){
		if( col.id === 'name' || col.id === 'url' ) return Pref.cmdItems[row][ VIEW_COL_MAP[col.id] ];
	},

	//  0:false  /  1:true
	getCellValue : function(row,col){
		return ( (col.id === 'isScript') && (Pref.cmdItems[row].isScript === 1) );
	},

	isEditable: function(row, col) {
		return !( col.id === 'delete'
			||    col.id === 'icon'
			||  ( col.id === 'url' && Pref.cmdItems[row].isScript === 1 )
			||  ( col.id !== 'url' && col.id !== 'name' && row === Pref.cmdItems.length-1 )
		);
	},

	setCellText: function(row, col, value){
		// attempt obtain a favicon
		if( treeView.shouldGetFavicon(row, col, value) ) Pref.getFavicon(row, value);

		// further append an item for explain when append new item
		if(row === Pref.cmdItems.length-1 && value !== Pref.cmdItems[row][ VIEW_COL_MAP[col.id] ] ){
			if(col.id === 'name') Pref.cmdItems[row].url_script = null;	// over write explanation
			Pref.appendExplainItem();

			var newIdx = this.rowCount - 1;
			this.treebox.rowCountChanged(newIdx, 1);
			this.treebox.ensureRowIsVisible(newIdx);
			this.treebox.treeBody.focus();
		}

		Pref.cmdItems[row][ VIEW_COL_MAP[col.id] ] = value;
		this.treebox.invalidate();
	},

	// get the favicon when URL are edited. except no changes or 'isScript' is true
	shouldGetFavicon: function(row, col, value){
		return( ( col.id === 'url' )
			 && ( value  !== Pref.cmdItems[row][ VIEW_COL_MAP[col.id] ] ) 
			 && ( 0      === Pref.cmdItems[row].isScript )
		);
	},

	setCellValue: function(row, col, value){
		Pref.cmdItems[row].isScript = (value === 'true')?1:0;
		this.treebox.invalidate();
		Pref.switchZoomDisable();
	},

	getImageSrc: function(row,col){ return ( Pref.cmdItems[row][ VIEW_COL_MAP[col.id] ]) },

	dragStart: function(e){
		var sourceIdx = treeView.selection.currentIndex;
		if( sourceIdx === Pref.cmdItems.length -1 ) return;	// last item (explain) is not movable
		e.dataTransfer.setData('text/x-moz-tree-index', sourceIdx);
		e.dataTransfer.dropEffect = 'move';
	},

	canDrop: function(targetIdx, orientation, dataTransfer){
		var curIdx = treeView.selection.currentIndex;
		return ( dataTransfer.types.contains('text/x-moz-tree-index')
			  && curIdx    !== -1
			  && curIdx    !== targetIdx
			  && curIdx    !== (targetIdx + orientation)
			  && targetIdx !== Pref.cmdItems.length-1
		);
	},

	drop: function(targetIdx, orientation, dataTransfer){
		if( !this.canDrop(targetIdx, orientation, dataTransfer) ) return;

		// change index either up or down
		var sourceIdx = treeView.selection.currentIndex;
			if(sourceIdx < targetIdx){
				if(orientation === Ci.nsITreeView.DROP_BEFORE) targetIdx--;
			} else {
				if(orientation === Ci.nsITreeView.DROP_AFTER ) targetIdx++;
			}
		if( targetIdx < 0 || targetIdx > this.rowCount -1 ) return;	// over!

		// once remove from original array, and re-insert it to a new position
		var removedItems = Pref.cmdItems.splice(sourceIdx, 1);
		Pref.cmdItems.splice(targetIdx, 0, removedItems[0]);

		this.treebox.invalidate();
		this.selection.clearSelection();
		this.selection.select(targetIdx);
		this.treebox.ensureRowIsVisible(targetIdx);
		this.treebox.treeBody.parentNode.focus();
	},

	// helper for extract position of mouse pointer on tree
	getCell: function(e){
		var irow = {}, icol = {}, ipart = {};
		this.treebox.getCellAt(e.clientX, e.clientY, irow, icol, ipart);
		return {row: irow, col: icol, part: ipart};
	},

	// capture (single)click event on tree object. change icon or delete row button
	clicked : function(e){
		var {row, col, part} = this.getCell(e);
		if( !col.value || row.value === Pref.cmdItems.length-1 ) return;

		switch(col.value.id){
			case 'delete' : this.removeObjectAt(row.value);	break;
			case 'icon'   : this.useLocalIcon(row);			break;
		}
	},

	removeObjectAt: function(index){
		Pref.cmdItems.splice(index, 1);
		this.treebox.rowCountChanged(index, -1);
		this.selection.clearSelection();
	},

	useLocalIcon: function(row){
		var loadedImage = Pref.loadLocalIcon();
		if(loadedImage) Pref.cmdItems[row.value].favicon = loadedImage;
	},

	// capture (double)click event on tree object. open script editor when isScript is true
	dblclicked: function(e){
		var {row, col, part} = this.getCell(e);
		if(!col.value || row.value === Pref.cmdItems.length-1) return;

		if( col.value.id === 'url' && Pref.cmdItems[row.value].isScript ){
			var argObj = { arg: Pref.cmdItems[row.value].url_script };
			document.documentElement.openSubDialog(
				'chrome://clipreference/content/scriptEditor.xul',
				'resizable,chrome,dialog=yes,centerscreen,modal=yes',
				argObj
			);
			if(argObj.edited) Pref.cmdItems[row.value].url_script = argObj.result;
		}
	},

	// capture mousemove event on tree object. change color of delete button icon
	moveCursor: function(e){
		var {row, col, part} = this.getCell(e);
		if(!col.value) return ;

		Pref.fillIconGlay();
		if(col.value.id === 'delete') Pref.cmdItems[row.value].delete = Pref.ICON_DEL_RED;
		Pref.cmdItems[Pref.cmdItems.length-1].delete = null;	// row of explain item always not display delete button icon
	},

	getCellProperties: function(row,col,props){
		if( row === Pref.cmdItems.length-1 )	// explain item
			props.AppendElement(Cc['@mozilla.org/atom-service;1'].getService(Ci.nsIAtomService).getAtom('newItem'));
	},

	getLevel: dummyF,
	isSorted: dummyF,
	cycleHeader: dummyN,
	isContainer: dummyF,
	isSeparator: dummyF,
	stopEditing: dummyN,
	getParentIndex: function(rowIndex) { return -1; },
	getRowProperties: dummyN,
	getColumnProperties: dummyN,
};

