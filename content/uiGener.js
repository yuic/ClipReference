//var logU = loger('   U    ');

// UIジェネレータのインスタンスを保存する人
var GenerHolder = function(){};
GenerHolder.prototype = {
	map: {},
	getInstance: function(clazz){
		if(this.map[clazz]) return this.map[clazz];
		switch(clazz){
			case 'UiGenerCmd': return this.map[clazz] = new UiGenerCmd(); break;
			case 'UiGenerMin': return this.map[clazz] = new UiGenerMin(); break;
			case 'UiGenerDef': return this.map[clazz] = new UiGenerDef(); break;
		}
	},
};
var Holder = new GenerHolder();

// UIジェネレータ(ユーザスクリプト)
var UiGenerCmd = function(){};
UiGenerCmd.prototype = {
	// ui作るかhiddenになってるものを再表示する
	buildUi: function(clip){
		// display target elements will be 'hidden = false', otherwise 'true'.
		var children = clip.dtpanel.childNodes;
		var find = false;
		for( var i=0, iLim=children.length; i<iLim; i++ )
			( children[i].hidden = !(this.buildIdList.indexOf(children[i].id) > -1) ) ? void(0) : find = true;

		// なければcreateUiする
		if(!find)
			for( var i=0, parts=this.createUi(clip), iLim=parts.length; i<iLim; clip.dtpanel.appendChild(parts[i]), i++ );

		// 個別にしたい事があればどうぞ
		this.optionalBuild(clip);
	},

	// ui作る
	createUi: function(clip){
		var {favicon, name} = DB.getLabelDataById(clip.id);
		var cmdBtn = GenerUtils.createToolbarButton( 'cmdBtn', name, favicon, (ClipManager.displayLabel ? {label: name} : null) );

		cmdBtn.addEventListener('click', function(e){
			if( clip.isMoved() ) return;

			var key = 'behavior' + e.button;
			if( DB.getPrefByKeys([key])[key] === '0' ) return;

			window.setTimeout(DB.getWebQueryStringsById(clip.id).url_script, 0);	// execute user script
			ClipManager.notify(e, -1);
		}, false);

		if(ClipManager.minMoveFree) GenerUtils.attachMouseEvents(cmdBtn, clip);	// 掴んで移動するためのイベント処理
		return [cmdBtn];
	},

	// ui生成中に属性いじりたい時用
	optionalBuild: function(clip){ clip.dtpanel.minWidth = clip.dtpanel.minHeight = null; },

	// 閉じるときにサイズごとに次回開くときのサイズを復元する用
	setLastSize: function(clip, {}){},	// i'm not doing anything! (*`ω´)

	// ポップアップを開くときにバックグラウンドで変更されたサイズ変更を反映させる用
	// (firefoxがウィンドウごとに管理してるものを上書きするためのもの)
	adjustSize: function(clip){},		// me too! (`ω´*)

	// return the url that popup should open
	getCurrentUrl: function(clip){},	// ... (`ω´)

	// if always popup in minimized = ON, do resize in background.
	resize: function(clip){},			// (@益@#)

	// 閉じるときにサイズごとに次回開くときの場所を保存する用
	setLastPosition: function(clip, {left, top}){
		clip.lastPosX_min = left-2 - clip.popEvtPosX;	// ナゾの2px...
		clip.lastPosY_min = top -2 - clip.popEvtPosY;
	},

	// このジェネレータが表示させるべきコンテナのID
	buildIdList: ['cmdBtn'],

	// 開くときにサイズごとに前回閉じた場所を復元する用
	getPopupPosition: function(clip){
		return { x:clip.lastPosX_min + clip.popEvtPosX, y:clip.lastPosY_min + clip.popEvtPosY};
	},
};


// UIジェネレータ(最小化時)
var UiGenerMin = function(){};
UiGenerMin.prototype = $extend(new UiGenerCmd(), {
	createUi: function(clip){
		var {favicon, name} = DB.getLabelDataById(clip.id);

		// 最小化状態のポップアップの上にあるボタン
		var minMnu = GenerUtils.createToolbarButton( 'minMnu', name, favicon, (ClipManager.displayLabel ? {label: name} : null) );
			minMnu.addEventListener('click', function(e){ if( !clip.isMoved() ) GenerUtils.runMenu(e, clip, true); }.bind(clip), false);

		if(ClipManager.minMoveFree) GenerUtils.attachMouseEvents(minMnu, clip);
		return [minMnu];
	},
	buildIdList: ['minMnu'],
	optionalBuild: function(clip){
		clip.dtpanel.minWidth = clip.dtpanel.minHeight = null;
		if(clip.pinBtn) clip.pinBtn.checked=false;
	},
	getCurrentUrl: function(clip){
		return LoaderUtils.composeUrl(DB.getWebQueryStringsById(clip.id).url_script, ClipManager.selectedChars);
	},
});


// UIジェネレータ(展開時)
var UiGenerDef = function(){};
UiGenerDef.prototype = $extend(new UiGenerCmd(), {
	createUi: function(clip){
		// 描画エリア
		clip.browsPane = clip.webLoader.createBrowsPane(clip);

		// ブラウザで開くボタン
		var opnBtn  = GenerUtils.createToolbarButtonA('opnBtn', $LOCALE('pop.tooltip.open'), DB.getLabelDataById(clip.id).favicon);
			opnBtn.addEventListener('command', function(e){ GenerUtils.runMenu(e, clip); }, false);

		// 最小化ボタン
		var minBtn  = GenerUtils.createToolbarButtonA('minBtn', $LOCALE('pop.tooltip.minimize'));
			minBtn.addEventListener('command', function(e){
				Holder.getInstance(clip.uiGenerType).setLastSize(clip, clip.dtpanel.getOuterScreenRect());
				clip.restuff('UiGenerMin');
			}.bind(clip), false);

		// ピン留めボタン
		clip.pinBtn = GenerUtils.createToolbarButtonA('pinBtn', $LOCALE('pop.tooltip.pin'), null, {type: 'checkbox'});

		// ブラウザと同期ボタン
		clip.sycBtn = GenerUtils.createToolbarButtonA('sycBtn', $LOCALE('pop.tooltip.sync'), null, {type: 'checkbox'});
		clip.sycBtn.addEventListener('command', function(e){ if(clip.sycBtn.checked) clip.webLoader.load(clip); }, false);

		// スペーサーと 、掴んで移動するためのイベント処理
		var spacer = $EL( 'spacer', {id: 'spacer', width: 30, flex: 1}, [], {cursor: '-moz-grab'} );
		GenerUtils.attachMouseEvents(spacer, clip);

		// 右下のサイズ変更するやつ
		var resizer = $EL('resizer', {id: 'resizer', dir: 'bottomright'});
			resizer.addEventListener('mouseup', function(e){
				Holder.getInstance(clip.uiGenerType).setLastSize(clip, clip.dtpanel.getOuterScreenRect());
				ClipManager.saveAppData(clip.id);
			}, false);	// 苦肉のサク２

		var toolbox = $EL('hbox', {id: 'toolbox'}, [
			clip.pinBtn,
			clip.sycBtn,
			opnBtn,
			minBtn,
			clip.webLoader.createOptional(clip),	// 倍率変更コンボボックス(iframe(browser)以外はdummy)
			spacer,
			$EL('hbox', {align: 'center'} , [$EL('image', {id: 'loadingicon', src: ''})] ),
			resizer
		]);
		return [clip.browsPane, toolbox];
	},
	buildIdList: ['browspane', 'toolbox'],
	adjustSize: function(clip){ clip.dtpanel.sizeTo(clip.lastWidth, clip.lastHeight); },
	setLastSize: function(clip, {width, height}){
		clip.lastWidth  = width;
		clip.lastHeight = height;
	},
	setLastPosition: function(clip, {left, top}){
		clip.lastPosX_def = left;
		clip.lastPosY_def = top;
	},
	getPopupPosition: function(clip){ return { x:clip.lastPosX_def, y:clip.lastPosY_def}; },
	optionalBuild: function(clip){
		clip.dtpanel.minWidth = 255;	// これ以上小さくするとリサイザが隠れる
		clip.dtpanel.minHeight = 35;

		// デフォルト設定適用 / DBアクセスのオーバヘッドをHttpアクセスのオーバヘッドに紛れ込ませてうやむやにする
		window.setTimeout( function(){
			var {defaultPin: pin, defaultSync: syc, defaultZoom: zoom } = DB.getDefaultById(clip.id);
			clip.pinBtn.checked = (pin === 1);
			clip.sycBtn.checked = (syc === 1);
			clip.webLoader.changeZoom(clip, zoom);
		}, 100 );
	},
	getCurrentUrl: function(clip){ return clip.webLoader.currentUrl(clip); },
	resize: function(clip){ if(ClipManager.alwaysMinimum) clip.restuff('UiGenerMin'); },
});


var GenerUtils = {
	// 引数elementに掴んで移動させるイベント処理を付加
	attachMouseEvents: function(element, clip){
		// 掴まれた：　ポップアップ上でのカーソルの相対位置を記憶させ、後はマウスむーぶイベントに任せる
		element.addEventListener('mousedown', function(e){
			var bound = clip.dtpanel.getBoundingClientRect();
			clip.offsetX = e.layerX - bound.left;
			clip.offsetY = e.layerY - bound.top;
			element.style.cursor = '-moz-grabbing';
			clip.dtpanel.addEventListener('mousemove', mousemoveListener, false);
		}.bind(clip), false);

		// 放された：　カーソルを元に戻して配置場所変数更新、マウスむーぶイベント解放
		var lastCursorShape = element.style.cursor;
		element.addEventListener('mouseup', function(e){
			element.style.cursor = lastCursorShape;
			Holder.getInstance(clip.uiGenerType).setLastPosition(clip, clip.dtpanel.getOuterScreenRect());
			clip.dtpanel.removeEventListener('mousemove', mousemoveListener, false);
			ClipManager.saveAppData(clip.id);	// 苦肉のサク。ここでやらないと複数ウィンドウを開けたときにイワカン
		}.bind(clip), false);

		// 掴んで放すまで：　ドラッグした時にポップアップを追従させる用
		var mousemoveListener = function(e){ clip.dtpanel.moveTo(e.screenX - clip.offsetX, e.screenY - clip.offsetY); }.bind(clip);
	},

	// ポップアップした時のURLとキーワードをブラウザで開く
	openInBrowser: function(url, related, background){
		Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser").gBrowser
				.loadOneTab( url, {relatedToCurrent: (related === '2'), inBackground: (background === '0')} );
	},

	// Def用ボタン生成ヘルパ / UiGenerDefの時はdisplayLabelにかかわらずtoolbarbutton-1にする
	createToolbarButtonA: function(id, txt, favicon, aMisc){
		var misc = (aMisc || {});
		misc.class = 'toolbarbutton-1';
		return GenerUtils.createToolbarButton(id, txt, favicon, misc);
	},

	// ボタン生成
	createToolbarButton: function(id, txt, favicon, misc){
		var attrs = {id: id, tooltiptext: txt};
		if(!ClipManager.displayLabel) attrs.class = 'toolbarbutton-1';
		attrs.style = 'list-style-image: url("chrome://clipreference/content/icon/icons.png");';	// CSSに定義するとデフォルトのToolbar.pngに負けるみたい
		if(favicon) attrs.image = favicon;
		if(misc) for(var a in misc) attrs[a] = misc[a];
		return $EL('toolbarbutton', attrs);
	},

	// 実行するコマンド振り分ける人
	runMenu: function(e, clip, perButtons, priorUrl){
		// DBからボタンに応じた設定値取出し
		var [behaviorKey, activate] = (perButtons)
			? ['behavior' + e.button, 'openTabActivate' + e.button ] : ['behaviorB', 'openTabActivateB'];
		var prefs = DB.getPrefByKeys([behaviorKey, activate]);

		// open url according to settings of 「Open in browser」 / propaty name is DB value of keys of pref.behaviorX
		var behaviors = {
			0: function(){},	// なにもしない

			1: function(){		// サイズ切り替え
				clip.restuff('UiGenerDef', clip.lastWidth, clip.lastHeight);
				ClipManager.notify(e, clip.id);
			},

			2: function(){		// 新しいタブで開く(右隣)
				GenerUtils.openInBrowser(
					(priorUrl || Holder.getInstance(clip.uiGenerType).getCurrentUrl(clip)), prefs[behaviorKey], prefs[activate] );
				ClipManager.notify( e, (perButtons ? -1 : clip.id) );
			},

			3: function(){		// 新しいタブで開く(末尾)
				behaviors[2]();
			},

			4: function(){		// 新しいウィンドウで開く
				window.open( priorUrl || Holder.getInstance(clip.uiGenerType).getCurrentUrl(clip) );
				ClipManager.notify( e, (perButtons ? -1 : clip.id) );
			},
		};
		behaviors[ prefs[behaviorKey] ]();
	},

};
