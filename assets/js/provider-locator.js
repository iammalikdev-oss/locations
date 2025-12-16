jQuery(document).ready(function($) {
    'use strict';

    let heroMap, miniMap, currentCountry, currentState;
    let stateLayer, cityMarkers = [];
    
    // Map configurations
    const mapConfig = {
        tileLayer: '',
        attribution: '',
        options: {
            zoomControl: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            dragging: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false,
            attributionControl: false
        }
    };
    
    // Country/State map bounds
    const mapBounds = {
        usa: { center: [37.8, -96], zoom: 4 },
        florida: { center: [27.9944, -81.7603], zoom: 6 },
        texas: { center: [31.0, -99.0], zoom: 6 },
        california: { center: [36.7783, -119.4179], zoom: 6 },
        ireland: { center: [53.4, -8.0], zoom: 7 },
        uae: { center: [24.0, 54.0], zoom: 7 },
        uk: { center: [54.5, -3.5], zoom: 6 }
    };

    // US states mapping (slug -> 2-letter abbr). Used to match SVG filenames and IDs.
    const usStateAbbr = {
        'alabama':'al','alaska':'ak','arizona':'az','arkansas':'ar','california':'ca','colorado':'co','connecticut':'ct','delaware':'de',
        'florida':'fl','georgia':'ga','hawaii':'hi','idaho':'id','illinois':'il','indiana':'in','iowa':'ia','kansas':'ks','kentucky':'ky',
        'louisiana':'la','maine':'me','maryland':'md','massachusetts':'ma','michigan':'mi','minnesota':'mn','mississippi':'ms','missouri':'mo',
        'montana':'mt','nebraska':'ne','nevada':'nv','new-hampshire':'nh','new-jersey':'nj','new-mexico':'nm','new-york':'ny','north-carolina':'nc',
        'north-dakota':'nd','ohio':'oh','oklahoma':'ok','oregon':'or','pennsylvania':'pa','rhode-island':'ri','south-carolina':'sc','south-dakota':'sd',
        'tennessee':'tn','texas':'tx','utah':'ut','vermont':'vt','virginia':'va','washington':'wa','west-virginia':'wv','wisconsin':'wi','wyoming':'wy',
        'district-of-columbia':'wdc'
    };
    const abbrToState = {};
    Object.keys(usStateAbbr).forEach(function(slug){ abbrToState[usStateAbbr[slug]] = slug; });

    function normalizeStateIdentifier(raw) {
        if (!raw) return '';
        // handle ids like 'US-TX', 'usa-tx', 'state-texas', etc.
        var s = raw.toLowerCase().replace(/^state[-_]/,'').replace(/^usa[-_]/,'').replace(/^us[-_]/,'').replace(/[^a-z\-]/g,'');
        // if it's a two-letter abbr or a special 'wdc'
        if (s.length === 2 || s === 'wdc') {
            return abbrToState[s] || s;
        }
        // if it's already a full slug
        if (usStateAbbr[s]) return s;
        return s;
    }
    
    // Initialize based on page type
    if ($('#heroMap').length) {
        initHeroMap();
    }
    
    if ($('#map').length && $('#mapSection').length) {
        const country = $('#map').data('country') || 'ireland';
        initSingleMap(country);
    }
    
    /**
     * Initialize Hero Map (USA)
     */
    function initHeroMap() {
        // Load state counts and then the designer SVG (assets/images/usa.svg)
        getStatesCounts('usa').then(function(data) {
            // Attempt to load SVG map for USA (check both images/usa-maps/usa.svg and images/usa.svg)
            var base = (window.providerLocator && window.providerLocator.assetUrl) ? window.providerLocator.assetUrl + 'images/' : '/wp-content/plugins/providers/assets/images/';
            var candidates = [ base + 'usa-maps/usa.svg', base + 'usa.svg' ];
            function tryHero(idx) {
                if (idx >= candidates.length) {
                    // Fallback: draw GeoJSON states on a Leaflet map
                    // (left as an optional enhancement)
                    return;
                }
                fetch(candidates[idx]).then(function(r){
                    if (!r.ok) throw new Error('not found');
                    return r.text();
                }).then(function(svgText){
                    var container = document.querySelector('#heroMap');
                    container.innerHTML = svgText;
                    // ensure SVG scales to container
                    var svg = container.querySelector('svg');
                    if (svg) {
                        svg.removeAttribute('width');
                        svg.removeAttribute('height');
                        svg.setAttribute('preserveAspectRatio','xMidYMid meet');
                        styleSvgStates(svg, data.counts, data.upcoming);
                    }
                }).catch(function(){ tryHero(idx+1); });
            }
            tryHero(0);
        });
    }

    /**
     * Fetch state counts (returns Promise resolving to {counts: {slug:count}, upcoming: [slugs]})
     */
    function getStatesCounts(country) {
        return new Promise(function(resolve) {
            var upcomingRaw = document.getElementById('heroMap') ? document.getElementById('heroMap').getAttribute('data-upcoming') : '';
            var upcoming = upcomingRaw ? upcomingRaw.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];

            $.ajax({
                url: providerLocator.ajaxUrl,
                type: 'POST',
                data: { action: 'get_states', country: country, nonce: providerLocator.nonce },
                success: function(response) {
                    var counts = {};
                    if (response && response.success) {
                        response.data.forEach(function(s){ counts[s.slug] = s.count; });
                    }
                    resolve({ counts: counts, upcoming: upcoming });
                },
                error: function() {
                    resolve({ counts: {}, upcoming: upcoming });
                }
            });
        });
    }

    /**
     * Generic helper: fetch an SVG from assets/images and insert it into the container
     */
    function loadSvgInto(containerSelector, filename, onSuccess, onFail) {
        var base = (window.providerLocator && window.providerLocator.assetUrl) ? window.providerLocator.assetUrl + 'images/' : '/wp-content/plugins/providers/assets/images/';
        var url = base + filename;
        fetch(url).then(function(resp){
            if (!resp.ok) throw new Error('not found');
            return resp.text();
        }).then(function(svgText){
            var container = document.querySelector(containerSelector);
            if (!container) return onFail && onFail();
            // remove any loading overlay that might sit over the map
            var overlay = container.querySelector('.loading-overlay');
            if (overlay) overlay.parentNode.removeChild(overlay);
            container.innerHTML = svgText;
            if (onSuccess) onSuccess(container.querySelector('svg') || container);
        }).catch(function(){
            if (onFail) onFail();
        });
    }

    /**
     * Style inline SVG state elements and bind interactions
     */
    function styleSvgStates(svgEl, counts, upcoming) {
        if (!svgEl) return;
        // find candidate state elements by data attributes or id
        var elems = svgEl.querySelectorAll('[data-slug], [data-state], [id]');
        elems.forEach(function(el){
            var raw = (el.getAttribute('data-slug') || el.getAttribute('data-state') || el.id || '');
            var slug = normalizeStateIdentifier(raw);
            if (!slug) return;
            var isCurrent = counts[slug] && counts[slug] > 0;
            var isUpcoming = upcoming.indexOf(slug) !== -1;
            if (isCurrent) el.style.fill = '#2563eb';
            else if (isUpcoming) el.style.fill = '#7c3aed';
            else el.style.fill = '#d1dae3';

            el.style.cursor = 'pointer';
            el.addEventListener('click', function(){
                selectStateSVG(slug);
            });

            // Try to add label using bbox (use 2-letter abbr if possible)
            try {
                var bbox = el.getBBox();
                var cx = bbox.x + bbox.width/2;
                var cy = bbox.y + bbox.height/2;
                // Prefer canonical 2-letter abbreviation from our mapping
                var abbr = (usStateAbbr[slug] || el.getAttribute('data-abbr') || el.getAttribute('data-code') || el.id || '').toUpperCase();
                // If abbr contains hyphen like 'US-TX', extract last 2 chars
                if (abbr.indexOf('-') !== -1) abbr = abbr.split('-').pop();
                abbr = abbr.slice(0,2);

                var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
                txt.setAttribute('x', cx);
                txt.setAttribute('y', cy);
                txt.setAttribute('text-anchor','middle');
                txt.setAttribute('dominant-baseline','central');
                txt.setAttribute('class','svg-state-label');

                // set a responsive font-size based on state bbox width
                var fontSize = Math.max(10, Math.min(20, Math.floor(bbox.width / 3)));
                txt.setAttribute('font-size', fontSize + 'px');

                txt.textContent = abbr;
                svgEl.appendChild(txt);
            } catch(e){/* ignore non-renderable shapes */}
        });
    }

    function selectStateSVG(slug) {
        // slug may be abbr or full; normalize to full slug
        var full = normalizeStateIdentifier(slug);
        currentState = full;
        // highlight selection
        var heroSvg = document.querySelector('#heroMap svg');
        if (heroSvg) {
            var all = heroSvg.querySelectorAll('[data-slug], [data-state], [id]');
            all.forEach(function(e){ e.style.stroke = 'none'; });
            var selected = heroSvg.querySelector('#'+slug) || heroSvg.querySelector('#'+full) || heroSvg.querySelector('[data-slug="'+slug+'"]') || heroSvg.querySelector('[data-slug="'+full+'"]') || heroSvg.querySelector('[data-state="'+slug+'"]') || heroSvg.querySelector('[data-state="'+full+'"]');
            if (selected) selected.style.stroke = '#1d4ed8';
        }
        // Load mini (state) SVG if available, otherwise fall back to geojson
        loadMiniMap(full);
        scrollToMiniMap();
    }
    
    /**
     * Load USA States
     */
    function loadStates() {
        // Fetch states with provider counts and use upcoming list from data attribute
        const upcomingRaw = document.getElementById('heroMap') ? document.getElementById('heroMap').getAttribute('data-upcoming') : '';
        const upcoming = upcomingRaw ? upcomingRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        $.ajax({
            url: providerLocator.ajaxUrl,
            type: 'POST',
            data: {
                action: 'get_states',
                country: 'usa',
                nonce: providerLocator.nonce
            },
            success: function(response) {
                if (response.success) {
                    const statesData = response.data;

                    // Add simplified USA state GeoJSON
                    const usaStates = getUSAStatesGeoJSON();
                    // mapping of slug -> count
                    const counts = {};
                    statesData.forEach(s => counts[s.slug] = s.count);

                    // remove previous label markers if any
                    if (window._stateLabelMarkers && window._stateLabelMarkers.length) {
                        window._stateLabelMarkers.forEach(m => heroMap.removeLayer(m));
                    }
                    window._stateLabelMarkers = [];

                    stateLayer = L.geoJSON(usaStates, {
                        style: function(feature) {
                            const slug = feature.properties.name.toLowerCase().replace(/\s+/g, '-');
                            if (counts[slug] && counts[slug] > 0) {
                                return { fillColor: '#2563eb', weight: 2, opacity: 1, color: '#1d4ed8', fillOpacity: 1 };
                            }
                            if (upcoming.indexOf(slug) !== -1) {
                                return { fillColor: '#7c3aed', weight: 2, opacity: 1, color: '#5b21b6', fillOpacity: 1 };
                            }
                            return { fillColor: '#d1dae3', weight: 2, opacity: 1, color: '#b0c4d9', fillOpacity: 1 };
                        },
                        onEachFeature: function(feature, layer) {
                            layer.on({
                                mouseover: function(e) {
                                    e.target.setStyle({ fillOpacity: 0.8 });
                                },
                                mouseout: function(e) {
                                    stateLayer.resetStyle(e.target);
                                },
                                click: function(e) {
                                    selectState(e);
                                }
                            });

                            // Add abbreviation label by computing simple centroid
                            const coords = feature.geometry.coordinates[0];
                            let latSum = 0, lngSum = 0, count = 0;
                            coords.forEach(pair => {
                                lngSum += pair[0];
                                latSum += pair[1];
                                count++;
                            });
                            const centroid = [latSum / count, lngSum / count];
                            const slug = feature.properties.name.toLowerCase().replace(/\s+/g, '-');
                            const abbr = (feature.properties && feature.properties.abbr) ? feature.properties.abbr : ((feature.properties.name.match(/\b([A-Z])/g) || []).slice(0,2).join(''));

                            const labelIcon = L.divIcon({
                                className: 'state-label',
                                html: abbr,
                                iconSize: [40, 20]
                            });

                            const marker = L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(heroMap);
                            window._stateLabelMarkers.push(marker);
                        }
                    }).addTo(heroMap);
                }
            }
        });
    }
    
    /**
     * Select State
     */
    function selectState(e) {
        const stateName = e.target.feature.properties.name;
        const stateSlug = stateName.toLowerCase().replace(/\s+/g, '-');
        
        currentState = stateSlug;
        
        stateLayer.eachLayer(layer => stateLayer.resetStyle(layer));
        e.target.setStyle({ fillOpacity: 0.8, color: '#1d4ed8' });
        
        loadMiniMap(stateSlug);
        scrollToMiniMap();
    }
    

    function computeSvgViewport(svgEl) {
        if (!svgEl) return null;
        var svgRect = svgEl.getBoundingClientRect();
        var vb = null;
        try {
            if (svgEl.viewBox && svgEl.viewBox.baseVal) {
                vb = svgEl.viewBox.baseVal;
            } else if (svgEl.getAttribute && svgEl.getAttribute('viewBox')) {
                var parts = svgEl.getAttribute('viewBox').split(/\s+/).map(function(p){ return parseFloat(p); });
                if (parts.length === 4) vb = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
            }
        } catch(e) { vb = null; }

        if (vb && typeof vb.width === 'number' && typeof vb.height === 'number' && svgRect.width > 0 && svgRect.height > 0) {
            var scale = Math.min(svgRect.width / vb.width, svgRect.height / vb.height);
            var renderedWidth = vb.width * scale;
            var renderedHeight = vb.height * scale;
            var offsetX = (svgRect.width - renderedWidth) / 2;
            var offsetY = (svgRect.height - renderedHeight) / 2;
            return { vb: vb, svgRect: svgRect, renderedWidth: renderedWidth, renderedHeight: renderedHeight, offsetX: offsetX, offsetY: offsetY };
        }
        return { vb: vb, svgRect: svgRect, renderedWidth: svgRect.width, renderedHeight: svgRect.height, offsetX: 0, offsetY: 0 };
    }

    // Normalize strings for tolerant matching (remove non-alnum and lowercase)
    function normalizeForMatch(s) {
        if (!s) return '';
        try {
            // remove diacritics where supported
            s = s.normalize ? s.normalize('NFD').replace(/\p{Diacritic}/gu, '') : s;
        } catch(e) { /* skip normalization */ }
        return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function loadMiniMap(state) {
        $('#stateTitle').text(state.toUpperCase().replace(/-/g, ' ') + ' SERVICE PROVIDERS');
        $('#miniMapSection').addClass('active');

        var base = (window.providerLocator && window.providerLocator.assetUrl) ? window.providerLocator.assetUrl + 'images/' : '/wp-content/plugins/providers/assets/images/';
        var abbr = usStateAbbr[state] || state.slice(0,2);
        var candidates = [
            base + 'usa-maps/usa-' + abbr + '.svg',
            base + 'usa-maps/usa-' + state + '.svg',
            base + 'usa-maps/' + abbr + '.svg',
            base + 'usa-maps/' + state + '.svg',
            base + 'states/' + state + '.svg',
            base + state + '.svg'
        ];

        function tryLoad(idx) {
            if (idx >= candidates.length) {
                // fallback to Leaflet geoJSON state map
                if (miniMap) miniMap.remove();
                var bounds = mapBounds[state] || mapBounds.usa;
                miniMap = L.map('miniMap', Object.assign({}, mapConfig.options, { center: bounds.center, zoom: bounds.zoom }));
                var stateGeoJSON = getStateGeoJSON(state);
                var sLayer = L.geoJSON(stateGeoJSON, { style: { fillColor: '#d1dae3', weight: 2, opacity: 1, color: '#b0c4d9', fillOpacity: 1 } }).addTo(miniMap);
                if (sLayer.getBounds) miniMap.fitBounds(sLayer.getBounds(), { padding: [20,20] });
                loadCityPins('usa', state);
                return;
            }
            fetch(candidates[idx]).then(function(r) {
                if (!r.ok) throw new Error('not found');
                return r.text();
            }).then(function(svgText) {
                var container = document.getElementById('miniMap');
                if (!container) return; // nothing to render into
                container.innerHTML = svgText;

                // ensure SVG scales to container and we enforce width 810px
                var svgEl = container.querySelector('svg');
                if (svgEl) {
                    // If the SVG lacks a viewBox but has width/height attr, set a viewBox so scaling works
                    if (!svgEl.getAttribute('viewBox')) {
                        var w = svgEl.getAttribute('width');
                        var h = svgEl.getAttribute('height');
                        // if numeric width/height are present, set viewBox accordingly
                        if (w && h && !isNaN(parseFloat(w)) && !isNaN(parseFloat(h))) {
                            svgEl.setAttribute('viewBox', '0 0 ' + parseFloat(w) + ' ' + parseFloat(h));
                        } else {
                            // fallback default viewBox so svg will render proportionally
                            svgEl.setAttribute('viewBox', '0 0 810 600');
                        }
                    }

                    svgEl.removeAttribute('width');
                    svgEl.removeAttribute('height');
                    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

                    // Force displayed size 
                    svgEl.style.display = 'block'; // avoid inline svg whitespace issues
                    svgEl.style.width = 'auto';
                    svgEl.style.height = 'auto';
                }

                // Wait for browser to layout the SVG before computing positions
                requestAnimationFrame(function() {
                    // After SVG renders, create pins overlay
                    loadCityPins('usa', state, null);
                    // load providers list for the state (empty city selection)
                    loadProviders('usa', state, '');
                });
            }).catch(function() {
                tryLoad(idx+1);
            });
        }

        tryLoad(0);
    }
    
    /**
     * Initialize Single Country Map
     */
    function initSingleMap(country) {
        $('#mapSection').addClass('active');

        // map of known country slugs to svg filenames
        var countryMap = {
            'ireland': 'ireland',
            'uae': 'united-arab-emirates',
            'uk': 'united-kingdom',
            'usa': 'usa'
        };

        // Try to load country SVG first (assets/images/<country>.svg)
        var base = (window.providerLocator && window.providerLocator.assetUrl) ? window.providerLocator.assetUrl + 'images/' : '/wp-content/plugins/providers/assets/images/';
        var fileName = countryMap[country] || country;
        var url = base + fileName + '.svg';

        fetch(url).then(function(r) {
            if (!r.ok) throw new Error('not found');
            return r.text();
        }).then(function(svgText) {
            document.getElementById('map').innerHTML = svgText;
            // style and optionally color regions
            getStatesCounts(country).then(function(data) {
                var svgEl = document.querySelector('#map svg');
                if (!svgEl) return;
                // color regions if present
                var elems = svgEl.querySelectorAll('[data-slug], [data-state], [id]');
                elems.forEach(function(el) {
                    var slug = (el.getAttribute('data-slug') || el.getAttribute('data-state') || el.id || '').toLowerCase();
                    slug = slug.replace(/^state[-_]/, '').replace(/\s+/g, '-');
                    var isCurrent = data.counts[slug] && data.counts[slug] > 0;
                    if (isCurrent) el.style.fill = '#2563eb';
                    else el.style.fill = '#d1dae3';
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', function() {
                        // If it's a region, try load providers for its slug
                        loadProviders(country, slug, '');
                    });
                });
            });
            // load base city pins (if the SVG doesn't provide pins, sidebar will show providers on click)
            // attempt to load city pins for this country into the SVG if any
            loadCityPins(country, null, null);
        }).catch(function() {
            // fallback to Leaflet country geoJSON
            var bounds = mapBounds[country] || { center: [0,0], zoom: 2 };
            var map = L.map('map', Object.assign({}, mapConfig.options, { center: bounds.center, zoom: bounds.zoom }));
            var countryGeoJSON = getCountryGeoJSON(country);
            var cLayer = L.geoJSON(countryGeoJSON, { style: { fillColor: '#d1dae3', weight: 2, opacity: 1, color: '#b0c4d9', fillOpacity: 1 } }).addTo(map);
            if (cLayer.getBounds) map.fitBounds(cLayer.getBounds(), { padding: [20,20] });
            loadCityPins(country, null, map);
        });
    }
    
    /**
     * Load City Pins - Improved version that matches city names with SVG element IDs
     */
    function loadCityPins(country, state, targetMap) {
        const map = targetMap || miniMap;

        $('.sidebar-content').html('<div class="loading-overlay"><div class="loading-spinner"></div></div>');

        $.ajax({
            url: providerLocator.ajaxUrl,
            type: 'POST',
            data: {
                action: 'get_cities',
                country: country,
                state: state || '',
                nonce: providerLocator.nonce
            },
            success: function(response) {
                if (!response.success || !response.data || response.data.length === 0) {
                    $('.sidebar-content').html('<div class="empty-state">No providers available for this location</div>');
                    return;
                }

                var svgEl = document.querySelector('#miniMap svg') || document.querySelector('#map svg');
                var svgContainer = document.getElementById('miniMap') || document.getElementById('map');

                if (svgEl && svgContainer) {
                    renderPinsOnSVG(svgEl, svgContainer, response.data, country, state);
                } else if (map) {
                    renderPinsOnLeaflet(map, response.data, country, state);
                } else {
                    $('.sidebar-content').html('<div class="empty-state">Map not initialized</div>');
                }
            },
            error: function() {
                $('.sidebar-content').html('<div class="empty-state">Error loading city data</div>');
            }
        });
    }

    /**
     * Render pins on SVG map by matching city names with SVG element IDs
     */
    function renderPinsOnSVG(svgEl, svgContainer, cities, country, state) {
        var existingOverlay = svgContainer.querySelector('.svg-pin-overlay');
        if (existingOverlay) existingOverlay.remove();

        var svgRect = svgEl.getBoundingClientRect();
        var containerRect = svgContainer.getBoundingClientRect();

        var computedStyle = window.getComputedStyle(svgContainer);
        if (computedStyle.position === 'static' || !computedStyle.position) {
            svgContainer.style.position = 'relative';
        }

        var overlayDiv = document.createElement('div');
        overlayDiv.className = 'svg-pin-overlay';
        overlayDiv.style.cssText = 'position:absolute;pointer-events:none;' +
            'left:' + (svgRect.left - containerRect.left) + 'px;' +
            'top:' + (svgRect.top - containerRect.top) + 'px;' +
            'width:' + svgRect.width + 'px;' +
            'height:' + svgRect.height + 'px;';
        svgContainer.appendChild(overlayDiv);

        var viewport = computeSvgViewport(svgEl);
        var pinsPlaced = 0;
        var debugMode = window.providerLocator && window.providerLocator.debug;

        console.log('Rendering pins for', cities.length, 'cities');

        cities.forEach(function(city, index) {
            var cityName = city.name || city.city || city.slug || '';
            if (!cityName) {
                console.warn('City at index', index, 'has no name:', city);
                return;
            }

            var svgElement = findSVGElementByCity(svgEl, cityName, city.slug);

            if (svgElement) {
                try {
                    var bbox = svgElement.getBBox();
                    var centerX = bbox.x + bbox.width / 2;
                    var centerY = bbox.y + bbox.height / 2;

                    var screenCoords = svgPointToScreen(centerX, centerY, viewport, svgRect);

                    if (debugMode) {
                        svgElement.style.outline = '2px solid red';
                        svgElement.setAttribute('data-matched-city', cityName);
                    }

                    createPin(overlayDiv, screenCoords.x, screenCoords.y, city, country, state);
                    pinsPlaced++;
                } catch(e) {
                    console.error('Could not place pin for city:', cityName, e);
                }
            } else {
                console.warn('No SVG element found for city:', cityName);
            }
        });

        console.log('Successfully placed', pinsPlaced, 'out of', cities.length, 'pins');

        if (pinsPlaced === 0) {
            var availableIds = Array.from(svgEl.querySelectorAll('[id]')).map(function(el) { return el.id; }).filter(Boolean);
            console.info('Available SVG element IDs:', availableIds);
            $('.sidebar-content').html('<div class="empty-state">No matching cities found on map<br><small>Check console for available IDs</small></div>');
        } else {
            $('.sidebar-content').html('<div class="empty-state">Select a city pin to view providers (' + pinsPlaced + ' available)</div>');
        }
    }

    /**
     * Find SVG element by city name with intelligent matching
     */
    function findSVGElementByCity(svgEl, cityName, citySlug) {
        if (!svgEl || !cityName) {
            console.warn('findSVGElementByCity: Missing required parameters', { svgEl: !!svgEl, cityName: cityName });
            return null;
        }

        var normalized = normalizeForMatch(cityName);
        var slugNorm = normalizeForMatch(citySlug || '');

        var tryIds = [
            cityName,
            cityName.replace(/\s+/g, '-'),
            cityName.replace(/\s+/g, ''),
            citySlug,
            citySlug ? citySlug.replace(/-/g, ' ') : '',
            citySlug ? citySlug.replace(/-/g, '') : ''
        ].filter(Boolean);

        for (var i = 0; i < tryIds.length; i++) {
            var id = tryIds[i];
            try {
                if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                    var el = svgEl.querySelector('#' + CSS.escape(id));
                    if (el) {
                        console.log('Found SVG element by CSS.escape:', id);
                        return el;
                    }
                }

                el = svgEl.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');
                if (el) {
                    console.log('Found SVG element by attribute selector:', id);
                    return el;
                }

                el = svgEl.querySelector('[data-name="' + id.replace(/"/g, '\\"') + '"]');
                if (el) {
                    console.log('Found SVG element by data-name:', id);
                    return el;
                }
            } catch(e) {
                console.warn('Error querying selector for:', id, e);
            }
        }

        var allElements = svgEl.querySelectorAll('[id]');
        for (var j = 0; j < allElements.length; j++) {
            var element = allElements[j];
            var elId = element.id || '';
            var elNorm = normalizeForMatch(elId);

            if (elNorm === normalized || elNorm === slugNorm) {
                console.log('Found SVG element by normalized match:', elId, 'for city:', cityName);
                return element;
            }

            if (normalized.length > 3 && elNorm.indexOf(normalized) !== -1) {
                console.log('Found SVG element by partial match:', elId, 'for city:', cityName);
                return element;
            }
            if (slugNorm.length > 3 && elNorm.indexOf(slugNorm) !== -1) {
                console.log('Found SVG element by slug partial match:', elId, 'for city:', cityName);
                return element;
            }
        }

        console.warn('No SVG element found for city:', cityName, 'slug:', citySlug, 'tried:', tryIds);
        return null;
    }

    /**
     * Convert SVG coordinates to screen coordinates
     */
    function svgPointToScreen(svgX, svgY, viewport, svgRect) {
        var x, y;

        if (viewport && viewport.vb && viewport.vb.width && viewport.vb.height) {
            var vb = viewport.vb;
            x = viewport.offsetX + ((svgX - vb.x) / vb.width) * viewport.renderedWidth;
            y = viewport.offsetY + ((svgY - vb.y) / vb.height) * viewport.renderedHeight;
        } else {
            x = svgX;
            y = svgY;
        }

        return { x: Math.round(x), y: Math.round(y) };
    }

    /**
     * Create a pin element
     */
    function createPin(container, x, y, city, country, state) {
        var pin = document.createElement('div');
        pin.className = 'svg-pin';
        pin.setAttribute('data-city', city.slug || '');
        pin.style.cssText = 'position:absolute;pointer-events:auto;' +
            'left:' + x + 'px;top:' + y + 'px;' +
            'transform:translate(-50%,-50%);';

        var cityDisplayName = city.name || city.city || city.slug || 'Unknown';
        pin.innerHTML = '<div class="pin-inner" title="' + cityDisplayName + '"></div>';

        pin.addEventListener('click', function(e) {
            e.stopPropagation();
            container.querySelectorAll('.pin-inner').forEach(function(el) {
                el.classList.remove('active');
            });
            pin.querySelector('.pin-inner').classList.add('active');
            loadProviders(country, state, city.slug);
        });

        container.appendChild(pin);
    }

    /**
     * Render pins on Leaflet map (fallback)
     */
    function renderPinsOnLeaflet(map, cities, country, state) {
        cityMarkers.forEach(function(marker) {
            if (map && map.removeLayer) map.removeLayer(marker);
        });
        cityMarkers = [];

        cities.forEach(function(city) {
            if (city.latitude && city.longitude) {
                var coords = [parseFloat(city.latitude), parseFloat(city.longitude)];

                var customIcon = L.divIcon({
                    className: 'custom-pin',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                    html: '<div class="pin-inner"></div>'
                });

                var marker = L.marker(coords, { icon: customIcon })
                    .addTo(map)
                    .on('click', function() {
                        document.querySelectorAll('.custom-pin').forEach(function(el) {
                            el.classList.remove('active');
                        });
                        if (this._icon) this._icon.querySelector('.pin-inner').classList.add('active');
                        loadProviders(country, state, city.slug);
                    });

                if (city.name || city.slug) {
                    marker.bindTooltip(city.name || city.slug, {
                        direction: 'top',
                        offset: [0, -10],
                        className: 'city-tooltip'
                    });
                }

                cityMarkers.push(marker);
            }
        });

        $('.sidebar-content').html('<div class="empty-state">Select a city pin to view providers</div>');
    }
    
    /**
     * Load Providers
     */
    function loadProviders(country, state, city) {
        $('.sidebar-content').html('<div class="loading-overlay"><div class="loading-spinner"></div></div>');
        
        $.ajax({
            url: providerLocator.ajaxUrl,
            type: 'POST',
            data: {
                action: 'get_providers',
                country: country,
                state: state || '',
                city: city,
                nonce: providerLocator.nonce
            },
            success: function(response) {
                if (response.success && response.data.length > 0) {
                    const count = response.data.length;
                    // Prefer an actual city display name when loading providers for a city
                    var headerTitle = 'Service Providers (' + count + ')';
                    if (city) {
                        var cityName = (response.data[0] && response.data[0].city) ? response.data[0].city : city.replace(/-/g,' ').replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
                        headerTitle = cityName + ' (' + count + ')';
                    }
                    $('.sidebar-header h3').text(headerTitle);

                    let html = '';
                    response.data.forEach(provider => {
                        html += `
                            <div class="provider-card">
                                <h4>${provider.name}</h4>
                                <div class="location-icon">${provider.city}</div>
                                <div class="address">${provider.address || 'Address not available'}</div>
                                <a href="${provider.link}" class="btn">View Details</a>
                            </div>
                        `;
                    });
                    $('.sidebar-content').html(html);
                } else {
                    // Display the city name in the header when possible
                    if (city) {
                        var nameFallback = city.replace(/-/g,' ').replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
                        $('.sidebar-header h3').text(nameFallback);
                    } else {
                        $('.sidebar-header h3').text('Service Providers');
                    }
                    $('.sidebar-content').html('<div class="empty-state">No providers found in this location</div>');
                }
            },
            error: function() {
                if (city) {
                    var nameFallback = city.replace(/-/g,' ').replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
                    $('.sidebar-header h3').text(nameFallback);
                }
                $('.sidebar-content').html('<div class="empty-state">Error loading providers</div>');
            }
        });
    }
    
    /**
     * Scroll to Mini Map
     */
    function scrollToMiniMap() {
        $('html, body').animate({
            scrollTop: $('#miniMapSection').offset().top - 20
        }, 600);
    }
    
    /**
     * Get USA States GeoJSON
     */
    function getUSAStatesGeoJSON() {
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": { "name": "Florida", "abbr": "FL" },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-87.6, 30.9], [-85.5, 30.0], [-84.9, 29.6], [-82.0, 30.0], [-81.0, 30.7], [-80.0, 27.0], [-80.5, 25.2], [-81.5, 24.5], [-82.5, 26.0], [-82.9, 27.5], [-84.0, 29.8], [-87.6, 30.9]]]
                    }
                },
                {
                    "type": "Feature",
                    "properties": { "name": "Texas", "abbr": "TX" },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-106.6, 31.8], [-103.0, 36.5], [-100.0, 36.5], [-94.5, 33.6], [-94.0, 29.7], [-97.0, 25.8], [-99.1, 26.4], [-102.0, 29.8], [-106.6, 31.8]]]
                    }
                },
                {
                    "type": "Feature",
                    "properties": { "name": "California", "abbr": "CA" },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-124.4, 42.0], [-120.0, 42.0], [-114.6, 35.0], [-114.1, 32.7], [-117.1, 32.5], [-118.5, 33.0], [-120.6, 34.5], [-122.5, 38.0], [-124.2, 40.0], [-124.4, 42.0]]]
                    }
                }
            ]
        };
    }
    
    /**
     * Get State GeoJSON
     */
    function getStateGeoJSON(state) {
        const geometries = {
            'florida': [[[-87.6, 30.9], [-85.5, 30.0], [-84.9, 29.6], [-82.0, 30.0], [-81.0, 30.7], [-80.0, 27.0], [-80.5, 25.2], [-81.5, 24.5], [-82.5, 26.0], [-82.9, 27.5], [-84.0, 29.8], [-87.6, 30.9]]],
            'texas': [[[-106.6, 31.8], [-103.0, 36.5], [-100.0, 36.5], [-94.5, 33.6], [-94.0, 29.7], [-97.0, 25.8], [-99.1, 26.4], [-102.0, 29.8], [-106.6, 31.8]]],
            'california': [[[-124.4, 42.0], [-120.0, 42.0], [-114.6, 35.0], [-114.1, 32.7], [-117.1, 32.5], [-118.5, 33.0], [-120.6, 34.5], [-122.5, 38.0], [-124.2, 40.0], [-124.4, 42.0]]]
        };
        
        return {
            "type": "Feature",
            "properties": { "name": state },
            "geometry": {
                "type": "Polygon",
                "coordinates": geometries[state] || geometries['florida']
            }
        };
    }
    
    /**
     * Get Country GeoJSON
     */
    function getCountryGeoJSON(country) {
        const geometries = {
            'ireland': [[[-10.5, 51.4], [-9.5, 51.5], [-8.5, 51.9], [-7.5, 52.3], [-6.5, 52.0], [-6.0, 53.4], [-6.2, 54.5], [-7.5, 55.3], [-8.5, 55.4], [-9.8, 54.5], [-10.0, 53.5], [-10.5, 52.0], [-10.5, 51.4]]],
            'uae': [[[51.5, 22.5], [56.4, 22.5], [56.4, 26.1], [56.0, 26.0], [55.2, 25.8], [54.0, 24.5], [52.0, 24.0], [51.5, 23.0], [51.5, 22.5]]],
            'uk': [[[-6.0, 49.9], [-5.0, 50.0], [-2.0, 50.7], [1.8, 51.5], [1.8, 52.5], [0.5, 53.5], [-3.0, 54.5], [-4.5, 55.0], [-5.5, 57.5], [-6.5, 58.5], [-7.5, 57.0], [-8.0, 55.0], [-5.5, 54.5], [-5.0, 53.0], [-4.0, 51.5], [-5.5, 50.0], [-6.0, 49.9]]]
        };
        
        return {
            "type": "Feature",
            "properties": { "name": country },
            "geometry": {
                "type": "Polygon",
                "coordinates": geometries[country] || geometries['ireland']
            }
        };
    }
});