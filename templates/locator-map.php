<?php
/**
 * Template: Service Provider Locator Map
 */

$country = isset($atts['country']) ? $atts['country'] : 'usa';
$type = isset($atts['type']) ? $atts['type'] : 'hero';
?>

<div class="provider-locator-wrapper">

    <!-- Navigation removed as per design requirement -->

    <?php if ($type === 'hero' && $country === 'usa'): ?>
        
        <!-- USA Page with Hero Map -->
        <div class="provider-container">
            <div class="page-header">
                <p>Click on the state to discover local service providers in your US state.</p>
            </div>

            <div id="heroMapSection">
                <div id="heroMap" data-country="usa" data-upcoming="<?php echo esc_attr(isset($atts['upcoming']) ? $atts['upcoming'] : ''); ?>"></div>
                <div class="legend">
                    <div class="legend-title">Legend</div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #d1dae3;"></div>
                        <span>Available States</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #2563eb;"></div>
                        <span>Current States</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #7c3aed;"></div>
                        <span>Upcoming States</span>
                    </div>
                </div>
            </div>

            <div id="miniMapSection">
                <div class="section-header">
                    <h2 class="section-title" id="stateTitle">Select a State</h2>
                </div>
                <div class="mini-map-container">
                    <div id="miniMapWrapper">
                        <div id="miniMap"></div>
                    </div>
                    <div id="providerSidebar">
                        <div class="sidebar-header">
                            <h3>Service Providers</h3>
                        </div>
                        <div class="sidebar-content">
                            <div class="empty-state">Select a city pin to view providers</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
    <?php else: ?>
        
        <!-- Single Country Page -->
        <div class="provider-container">
            <?php
            $country_titles = array(
                'ireland' => 'IRELAND',
                'uae' => 'UAE',
                'uk' => 'UK'
            );
            $title = isset($country_titles[$country]) ? $country_titles[$country] : strtoupper($country);

            ?>

            <div id="mapSection">
                <div class="section-header">
                    <h2 class="section-title"><?php echo esc_html($title); ?> Service Providers</h2>
                </div>
                <div class="map-container">
                    <div id="mapWrapper">
                        <div id="map" data-country="<?php echo esc_attr($country); ?>"></div>
                    </div>
                    <div id="providerSidebar">
                        <div class="sidebar-header">
                            <h3>Service Providers</h3>
                        </div>
                        <div class="sidebar-content">
                            <div class="empty-state">Select a city pin to view providers</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
    <?php endif; ?>
    
</div>