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
		// display the target element will be 'hidden = false', otherwise 'true'.
		var children = clip.dtpanel.childNodes;
		var find = false;
		for(var i=0, child; child=children[i++];)
			if( !(child.hidden = !(this.buildIdList === child.id)) ) find = true;

		// なければcreateUiする
		if(!find) clip.dtpanel.appendChild( this.createUi(clip) );

		// 個別にしたい事があればどうぞ
		this.optionalBuild(clip);
	},

	// ui作る
	createUi: function(clip){
		var {favicon, name} = DB.getLabelDataById(clip.id);
		var cmdBtn = GenerUtils.createToolbarButton( 'cmdBtn', name, favicon, (ClipManager.displayLabel ? {label: name} : null) );
			cmdBtn.style.position = 'absolute';

		cmdBtn.addEventListener('click', function(e){
			if( clip.isMoved() ) return;

			var key = 'behavior' + e.button;
			if( DB.getPrefByKeys([key])[key] === '0' ) return;

			window.setTimeout(DB.getWebQueryStringsById(clip.id).url_script, 0);	// execute user script
			ClipManager.notify(e, -1);
		}, false);

		if(ClipManager.minMoveFree) GenerUtils.attachMouseEvents(cmdBtn, clip);	// 掴んで移動するためのイベント処理
		return cmdBtn;
	},

	// ui生成中に属性いじりたい時用
	optionalBuild: function(clip){ clip.dtpanel.minWidth = clip.dtpanel.minHeight = null; },

	// 閉じるときにサイズごとに次回開くときのサイズを復元する用
	setLastSize  : dummyN,	// i'm not doing anything! (*`ω´)

	// ポップアップを開くときにバックグラウンドで変更されたサイズ変更を反映させる用
	// (firefoxがウィンドウごとに管理してるものを上書きするためのもの)
	adjustSize   : dummyN,	// me too! (`ω´*)

	// return the url that popup should open
	getCurrentUrl: dummyN,	// ... (`ω´)

	// if always popup in minimized is ON, change the popup size when closing it.
	resize       : dummyN,	// (@益@#)

	// 閉じるときにサイズごとに次回開くときの場所を保存する用
	setLastPosition: function(clip, {left, top}){
		clip.lastPosX_min = left-2 - clip.popEvtPosX;	// ナゾの2px...
		clip.lastPosY_min = top -2 - clip.popEvtPosY;
	},

	// このジェネレータが表示させるべきコンテナのID
	buildIdList: 'cmdBtn',

	// 開くときにサイズごとに前回閉じた場所を復元する用
	getPopupPosition: function(clip){
		return { x:clip.lastPosX_min + clip.popEvtPosX, y:clip.lastPosY_min + clip.popEvtPosY};
	},
	screenGapY: 1,
};


// UIジェネレータ(最小化時)
var UiGenerMin = function(){};
UiGenerMin.prototype = $extend(new UiGenerCmd(), {
	createUi: function(clip){
		var {favicon, name} = DB.getLabelDataById(clip.id);

		// 最小化状態のポップアップの上にあるボタン
		var minMnu = GenerUtils.createToolbarButton( 'minMnu', name, favicon, (ClipManager.displayLabel ? {label: name} : null) );
			minMnu.style.position = 'absolute';
			minMnu.addEventListener('click', function(e){ if( !clip.isMoved() ) GenerUtils.runMenu(e, clip, true); }.bind(clip), false);

		if(ClipManager.minMoveFree) GenerUtils.attachMouseEvents(minMnu, clip);
		return minMnu;
	},
	buildIdList: 'minMnu',
	optionalBuild: function(clip){
		clip.dtpanel.minWidth = clip.dtpanel.minHeight = null;
		if(clip.pinBtn) clip.pinBtn.checked = false;
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
		clip.sycBtn.addEventListener('command', function(e){
			if(clip.sycBtn.checked && ClipManager.selectedChars) clip.webLoader.load(clip);
		}, false);

		// スペーサーと 、掴んで移動するためのイベント処理
		var spacer = $EL( 'spacer', {id: 'spacer', flex: 1}, null, {cursor: '-moz-grab'} );
		GenerUtils.attachMouseEvents(spacer, clip);

		var toolbox = $EL(Directions.hvBox[ClipManager.toolDir], {id: 'toolbox'}, [
			// align指定用のハコ / 上のハコでalign指定するとspacerをつかめなくなる
			$EL(Directions.hvBox[ClipManager.toolDir], {align: 'center'}, [
				clip.pinBtn,
				clip.sycBtn,
				opnBtn,
				minBtn,
				clip.webLoader.createOptional(clip),	// 倍率変更コンボボックス(iframe(browser)以外はdummy)
			]),
			spacer,
			$EL( Directions.hvBox[ClipManager.toolDir], {align: 'center'} , [ $EL('image', {id: 'loadingicon', src: ''}) ] ),
		]);

		var contents = [
			{outer: 'vbox', elm1: toolbox,        elm2: clip.browsPane},	// top
			{outer: 'hbox', elm1: clip.browsPane, elm2: toolbox       },	// right
			{outer: 'vbox', elm1: clip.browsPane, elm2: toolbox       },	// bottom
			{outer: 'hbox', elm1: toolbox,        elm2: clip.browsPane},	// left
		][ClipManager.toolDir];

		var overflowH = {overflow: 'hidden'};
		var expanded = $EL('vbox', {flex: 1, id: 'expanded'}, [
			// top resizers
			$EL('hbox', {height: 2}, [
				$EL('resizer', {dir: 'topleft'}),
				$EL('resizer', {dir: 'top', flex: 1}),
				$EL('resizer', {dir: 'topright'}),
			], overflowH),

			// left and right resizers, browser and toolbarbuttons
			$EL('hbox', {flex: 1, width: 25}, [
				$EL('hbox'        , {width: 2}, [ $EL('resizer', {dir: 'left'}) ], overflowH),
				$EL(contents.outer, {flex : 1}, [ contents.elm1, contents.elm2  ]),
				$EL('hbox'        , {width: 2}, [ $EL('resizer', {dir: 'right'})], overflowH),
			], overflowH),

			// bottom resizers
			$EL('hbox', {height: 2}, [
				$EL('resizer', {dir: 'bottomleft'}),
				$EL('resizer', {dir: 'bottom', flex: 1}),
				$EL('resizer', {dir: 'bottomright'}),
			], overflowH),
		]);
		expanded.addEventListener('mouseup', function(e){
			if(e.target.tagName !== 'resizer') return;
			Holder.getInstance(clip.uiGenerType).setLastSize(clip, clip.dtpanel.getOuterScreenRect());
			ClipManager.saveAppData(clip.id);
		}, false);	// 苦肉のサク２、３ i've no choice but to capture all fired 'mouseup' on popup
		return expanded;
	},
	buildIdList: 'expanded',
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
	screenGapY: 3,
});


var GenerUtils = {
	// 引数elementに掴んで移動させるイベント処理を付加
	attachMouseEvents: function(element, clip){
		// 掴まれた：　ポップアップ上でのカーソルの相対位置を記憶させ、後はマウスむーぶイベントに任せる
		element.addEventListener('mousedown', function(e){
			var bound = clip.dtpanel.getBoundingClientRect();
			var gap = GenerUtils.osGap.pos;
			clip.offsetX = e.layerX - gap.screenX + 1;	// Xは1px、Yは1pxか2pxずれる(他のテーマだともっとずれる)
			clip.offsetY = e.layerY - gap.screenY + Holder.getInstance(clip.uiGenerType).screenGapY;
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
		Services.wm.getMostRecentWindow("navigator:browser").gBrowser
			.loadOneTab(url, {relatedToCurrent: (related === '2'), inBackground: (background === '0')});
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
			0: dummyN,			// なにもしない

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

	// close the gap between each OS
	osGap: {
		// position of the top and left edges of the window
		pos: {
			WINNT : { screenX: 0, screenY: 0 },
			Linux : $('main-window').boxObject,
			Darwin: { screenX: 0, screenY: 0 }	// just in case
		}[Services.appinfo.OS]
	},
};
