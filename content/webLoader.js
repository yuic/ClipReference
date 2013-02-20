//var logW = loger('    W   ');

var LoaderUtils = {
	// webページローダの共用部分
	iframe : {
		base    : {id: 'browspane', flex:1, src:'about:blank', type:'content'},
		options : {id: 'zoom', editable: true, tooltiptext: $LOCALE('pop.tooltip.zoom')},
		styles  : {border: 'solid ButtonShadow', borderWidth: ' 0px 0px 1px 0px'}
	},
	xml : {
		base    : {id: 'browspane', flex: 1},
		options : {id: 'dummybox', width: 0},
		styles  : {border: 'solid ButtonShadow', borderWidth: ' 0px 0px 1px 0px', borderRadius: '2px', overflow:'auto'},
	},

	// loadingアイコンの表示切り替え
	switchLoadingIcon: function(box, isLoading){
		box.getElementsByAttribute('id', 'loadingicon')[0].src = (isLoading ? 'chrome://global/skin/icons/loading_16.png' : '');
	},

	// trim, compose, URL encode and schema repair if neccesary
	composeUrl: function(aUrl, aParam){
		// url encord & change replacer
		var param = (aUrl.replace( /<.*>/g,'').length !== 0) ? encodeURIComponent(aParam.trim()) : aParam.trim();
		var url = aUrl.replace(/<.*>/g, param);

		// repair schema if it broken
		switch(true){
			case (url.indexOf('ttp://') === 0)  : ;						/*  break; */
			case (url.indexOf('ttps://') === 0) : url = 'h' + url;			break;
			case (url.indexOf('://') < 0)       : url = 'http://' + url;	break;
		}

		return url;
	},
};


// webページローダ(ダミー兼基底)
var WebLoaderNothing = function(){};
WebLoaderNothing.prototype = {
	createBrowsPane	: dummyN,	// ローダー毎のコンテント領域作る
	createOptional	: dummyN,	// ローダー毎に生成したいものがあればどうぞ
	load 			: dummyN,	// DBのURLと選択された文字列でページをロード
	currentUrl		: dummyN,	// ブラウザで開く用のURL
	clearBrowsPane	: dummyN,	// ポップアップのコンテント領域をまっさらに！
	changeZoom      : dummyN,	// ズーム変更(iframeのみ)

	// ロード実行適否判定
	preventLoad: function(clip){ return !(Holder.getInstance(clip.uiGenerType) instanceof UiGenerDef) },
};


// webページローダ(browser)
var WebLoaderIframe = function(){};
WebLoaderIframe.prototype = $extend(new WebLoaderNothing(), {
	createBrowsPane: function(clip){
		var bPane = $EL( 'browser', LoaderUtils.iframe.base, [], LoaderUtils.iframe.styles);
			bPane.addEventListener('click', function(e){	// wheelclick to open in browser
				var url = $searchHref(e.target);
				if( e.button === 1 && url ) GenerUtils.runMenu(e, clip, false, url);
			}.bind(this), false);
		return bPane;
	},
	createOptional: function(clip){
		// 表示倍率
		var zoomListener =  function(e){ this.changeZoom(clip, zmList.value) }.bind(this);
		var zmList = $EL('menulist', LoaderUtils.iframe.options, [
						$EL('menupopup', {}, [
							$EL('menuitem', {label: '120'}),
							$EL('menuitem', {label: '100', selected: true}),
							$EL('menuitem', {label:  '80'}) ])
					]);
			zmList.addEventListener('change',  zoomListener, false);
			zmList.addEventListener('select',  zoomListener, false);

		// 戻るボタン
		var backBtn = GenerUtils.createToolbarButtonA('bckBtn', $LOCALE('pop.tooltip.back'));
			backBtn.style.borderRadius='1em';
			backBtn.addEventListener( 'command', function(e){ clip.browsPane.goBack() }.bind(clip) );

		// 進むボタン
		var fwrdBtn = GenerUtils.createToolbarButtonA('fwdBtn', $LOCALE('pop.tooltip.forward'));
			fwrdBtn.style.borderRadius='1em';
			fwrdBtn.addEventListener( 'command', function(e){ clip.browsPane.goForward() }.bind(clip) );

		return $EL('hbox', {}, [zmList, backBtn, fwrdBtn]);
	},
	load: function(clip){
		if( this.preventLoad(clip) ) return;
		// 右下でくるくる回るやつ
		if( !clip.progListener ) clip.dtpanel.getElementsByAttribute('id', 'browspane')[0]
			.addProgressListener( clip.progListener = new ClrfProgressListener().init(clip), Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);

		clip.browsPane.contentDocument.location = LoaderUtils.composeUrl(DB.getWebQueryStringsById(clip.id).url_script, ClipManager.selectedChars);
	},
	clearBrowsPane: function(clip){ if(clip.browsPane) clip.browsPane.contentDocument.location = 'about:blank'; },
	currentUrl: function(clip){ return clip.browsPane.contentDocument.location },
	changeZoom: function(clip, zoom){
		clip.browsPane.docShell.contentViewer.QueryInterface(Ci.nsIMarkupDocumentViewer).fullZoom = (zoom / 100);
		clip.dtpanel.getElementsByAttribute('id', 'zoom')[0].value = zoom;
	},
});

// webページローダ(xpath)
var WebLoaderXml = function(){};
WebLoaderXml.prototype = $extend(new WebLoaderNothing(), {
	createBrowsPane: function(clip){
		var bPane = $EL('html', LoaderUtils.xml.base, [], LoaderUtils.xml.styles);
			bPane.addEventListener('click', function(e){
				var url = $searchHref(e.target);
				if( e.button === 1 && url ) GenerUtils.runMenu(e, clip, false, url);
				e.preventDefault();		// gBrowser be taken over when and if invoke href. by any means i have to prevent it...  (`ω´;)
				e.stopPropagation();
			}.bind(this), false);
		return bPane;
	},
	load: function(clip){
		if( this.preventLoad(clip) ) return;

		this.clearBrowsPane(clip);
		LoaderUtils.switchLoadingIcon(clip.dtpanel, true);
		var {url_script, xpath} = DB.getWebQueryStringsById(clip.id);
		var url = this.lastUrl = LoaderUtils.composeUrl(url_script, ClipManager.selectedChars);

		var reqHTML = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
			reqHTML.open( 'GET', url );
			reqHTML.responseType = 'document';
			reqHTML.onload = function(){
				LoaderUtils.switchLoadingIcon(clip.dtpanel, false);
				try{
					// xpathで要素取り出し / xpath解析不可、対象要素なしはポップアップ上にエラーメッセージ出す
					try{ var evad = $evaluateXPath(reqHTML.responseXML, xpath)[0]; }catch(ex1){ throw $LOCALE('pop.xpath.failed.evaluate'); };
					if(!evad) throw $LOCALE('pop.xpath.failed.elementnotfound');
					// imgタグのsrcにスキーマ書けや！
					var imgs = evad.getElementsByTagName('img');
					for(let i=0, iLim=imgs.length; i<iLim; imgs[i].setAttribute('src', imgs[i].src),i++);
					// くっつける
					clip.browsPane.appendChild( $ELNS('http://www.w3.org/1999/xhtml', 'html', {}, [evad], {width: (clip.lastWidth - 25 +'px') }) );	// う~ん…
				} catch(e) {
					// ポップアップ上にテーブル描く用
					var $$TN  = function(t) { return window.document.createTextNode(t) };
					var $$EL  = function(tag, children, style){ return $ELNS('http://www.w3.org/1999/xhtml', tag, {}, children, style) };
					var $$ROW = function(tds){
						var row=[];
						tds.forEach( function(elm){ row.push( $$EL('td', [ elm ]) ) });
						return $$EL('tr', row);
					}

					var atag = $$EL('a', [$$TN(url)], {color: '-moz-hyperlinktext', cursor: 'pointer'});
						atag.addEventListener('click', function(e){ GenerUtils.runMenu(e, clip, false, url); }, false );

					// エラー情報どーん！
					clip.browsPane.appendChild( $$EL('html', [
						$$EL('div', [ $$TN('ClipReference: ' + e) ], {fontWeight: 'bold', color: 'white', background: '-moz-linear-gradient(left, black, orange'}),
						$$EL('table', [
							$$ROW([$$EL('b', [$$TN( $LOCALE('pop.xpath.failed.menuname') )]) , $$TN(DB.getLabelDataById(clip.id).name)]),
							$$ROW([$$EL('b', [$$TN( $LOCALE('pop.xpath.failed.xpath')    )]) , $$TN(xpath)])
						]),
						$$EL('hr'),
						$$EL('table', [
							$$ROW([
								$$EL('div', [
									$$EL('b', [$$TN( $LOCALE('pop.xpath.failed.url') )]),
									$$TN('  [ Http Status: ' + reqHTML.status +' '+ reqHTML.statusText + ' ]')
								]),
							]),
							$$ROW([atag])
						]),
					], {width: (clip.lastWidth - 2 +'px') }) );
				}
			}.bind(clip);
		reqHTML.send();
	},
	currentUrl: function(clip){ return this.lastUrl;  },
	createOptional: function(){ return $EL('box', LoaderUtils.xml.options); },
	clearBrowsPane: function(clip){
		if(clip.browsPane) while( clip.browsPane.hasChildNodes() ) clip.browsPane.removeChild(clip.browsPane.firstChild);
	},
});


// iframeの右下でくるくる回るやつ
var ClrfProgressListener = function(){};
ClrfProgressListener.prototype = {
	init: function(clip){
		this.clip = clip;
		return this;
	},
	onStateChange: function(aWebProgress, aRequest, aFlag){
		var startBit = aFlag & Ci.nsIWebProgressListener.STATE_START;
		if( aWebProgress.DOMWindow.name && (startBit || aFlag & Ci.nsIWebProgressListener.STATE_STOP) )
			LoaderUtils.switchLoadingIcon(this.clip.dtpanel, Boolean(startBit));
		return 0;
	},
	QueryInterface: function(aIID){
		if (aIID.equals(Ci.nsIWebProgressListener) || aIID.equals(Ci.nsISupportsWeakReference) || aIID.equals(Ci.nsISupports)) return this;
		throw Components.results.NS_NOINTERFACE;
	},
	onStatusChange: dummy0,
	onProgressChange: dummy0,
	onLocationChange: dummy0,
	onSecurityChange: dummy0,
	onLinkIconAvailable: dummy0,
};
