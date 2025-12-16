<?php
/**
 * Plugin Name: Service Provider Locator
 * Plugin URI: https://yoursite.com
 * Description: Interactive map-based service provider locator with countries and regions. Use shortcode [provider_locator country="usa"] for USA or [provider_locator country="ireland" type="single"] for other countries.
 * Version: 2.0.0
 * Author: Your Name
 * Author URI: https://yoursite.com
 * Text Domain: service-provider-locator
 *
 * Shortcode Usage:
 * [provider_locator country="usa" type="hero"] - USA with state selection
 * [provider_locator country="ireland" type="single"] - Ireland map
 * [provider_locator country="uae" type="single"] - UAE map
 * [provider_locator country="uk" type="single"] - UK map
 */

if (!defined('ABSPATH')) exit;

class ServiceProviderLocator {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Register Custom Post Type
        add_action('init', array($this, 'register_provider_cpt'));
        
        // Register Taxonomies
        add_action('init', array($this, 'register_taxonomies'));
        
        // Add Meta Boxes
        add_action('add_meta_boxes', array($this, 'add_provider_meta_boxes'));
        add_action('save_post', array($this, 'save_provider_meta'));
        
        // Register Shortcodes
        add_shortcode('provider_locator', array($this, 'render_locator_map'));
        
        // Enqueue Scripts and Styles
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        
        // AJAX Handlers
        add_action('wp_ajax_get_providers', array($this, 'ajax_get_providers'));
        add_action('wp_ajax_nopriv_get_providers', array($this, 'ajax_get_providers'));
        
        add_action('wp_ajax_get_cities', array($this, 'ajax_get_cities'));
        add_action('wp_ajax_nopriv_get_cities', array($this, 'ajax_get_cities'));
        
        // AJAX: Get states list and statuses
        add_action('wp_ajax_get_states', array($this, 'ajax_get_states'));
        add_action('wp_ajax_nopriv_get_states', array($this, 'ajax_get_states'));
        
        // Create default pages on activation
        register_activation_hook(__FILE__, array($this, 'plugin_activation'));
    }
    
    /**
     * Register Provider Custom Post Type
     */
    public function register_provider_cpt() {
        $labels = array(
            'name' => 'Service Providers',
            'singular_name' => 'Service Provider',
            'menu_name' => 'Providers',
            'add_new' => 'Add New Provider',
            'add_new_item' => 'Add New Service Provider',
            'edit_item' => 'Edit Service Provider',
            'new_item' => 'New Service Provider',
            'view_item' => 'View Service Provider',
            'search_items' => 'Search Providers',
            'not_found' => 'No providers found',
            'not_found_in_trash' => 'No providers found in trash'
        );
        
        $args = array(
            'labels' => $labels,
            'public' => true,
            'has_archive' => true,
            'menu_icon' => 'dashicons-location-alt',
            'supports' => array('title', 'editor', 'thumbnail', 'excerpt'),
            'rewrite' => array('slug' => 'providers'),
            'show_in_rest' => true
        );
        
        register_post_type('service_provider', $args);
    }
    
    /**
     * Register Taxonomies
     */
    public function register_taxonomies() {
        // Country Taxonomy
        register_taxonomy('provider_country', 'service_provider', array(
            'label' => 'Countries',
            'hierarchical' => true,
            'show_admin_column' => true,
            'rewrite' => array('slug' => 'country')
        ));
        
        // State/Region Taxonomy
        register_taxonomy('provider_state', 'service_provider', array(
            'label' => 'States/Regions',
            'hierarchical' => true,
            'show_admin_column' => true,
            'rewrite' => array('slug' => 'state')
        ));
        
        // City Taxonomy
        register_taxonomy('provider_city', 'service_provider', array(
            'label' => 'Cities',
            'hierarchical' => true,
            'show_admin_column' => true,
            'rewrite' => array('slug' => 'city')
        ));
    }
    
    /**
     * Add Meta Boxes
     */
    public function add_provider_meta_boxes() {
        add_meta_box(
            'provider_details',
            'Provider Details',
            array($this, 'render_provider_meta_box'),
            'service_provider',
            'normal',
            'high'
        );
    }
    
    /**
     * Render Provider Meta Box
     */
    public function render_provider_meta_box($post) {
        wp_nonce_field('provider_meta_box', 'provider_meta_box_nonce');
        
        $address = get_post_meta($post->ID, '_provider_address', true);
        $phone = get_post_meta($post->ID, '_provider_phone', true);
        $email = get_post_meta($post->ID, '_provider_email', true);
        $website = get_post_meta($post->ID, '_provider_website', true);
        $latitude = get_post_meta($post->ID, '_provider_latitude', true);
        $longitude = get_post_meta($post->ID, '_provider_longitude', true);
        ?>
        <table class="form-table">
            <tr>
                <th><label for="provider_address">Address</label></th>
                <td><input type="text" id="provider_address" name="provider_address" value="<?php echo esc_attr($address); ?>" class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="provider_phone">Phone</label></th>
                <td><input type="text" id="provider_phone" name="provider_phone" value="<?php echo esc_attr($phone); ?>" class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="provider_email">Email</label></th>
                <td><input type="email" id="provider_email" name="provider_email" value="<?php echo esc_attr($email); ?>" class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="provider_website">Website</label></th>
                <td><input type="url" id="provider_website" name="provider_website" value="<?php echo esc_attr($website); ?>" class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="provider_latitude">Latitude</label></th>
                <td><input type="text" id="provider_latitude" name="provider_latitude" value="<?php echo esc_attr($latitude); ?>" class="regular-text" placeholder="e.g., 40.7128" /></td>
            </tr>
            <tr>
                <th><label for="provider_longitude">Longitude</label></th>
                <td><input type="text" id="provider_longitude" name="provider_longitude" value="<?php echo esc_attr($longitude); ?>" class="regular-text" placeholder="e.g., -74.0060" /></td>
            </tr>
        </table>
        <?php
    }
    
    /**
     * Save Provider Meta
     */
    public function save_provider_meta($post_id) {
        if (!isset($_POST['provider_meta_box_nonce']) || !wp_verify_nonce($_POST['provider_meta_box_nonce'], 'provider_meta_box')) {
            return;
        }
        
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }
        
        $fields = array('address', 'phone', 'email', 'website', 'latitude', 'longitude');
        
        foreach ($fields as $field) {
            if (isset($_POST['provider_' . $field])) {
                update_post_meta($post_id, '_provider_' . $field, sanitize_text_field($_POST['provider_' . $field]));
            }
        }
    }
    
    /**
     * Enqueue Frontend Assets
     */
    public function enqueue_frontend_assets() {
        if (is_singular('service_provider') || has_shortcode(get_post()->post_content, 'provider_locator')) {
            // Leaflet CSS
            wp_enqueue_style('leaflet-css', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css', array(), '1.9.4');
            
            // Plugin CSS
            wp_enqueue_style('provider-locator-css', plugin_dir_url(__FILE__) . 'assets/css/provider-locator.css', array(), '1.0.0');
            
            // jQuery
            wp_enqueue_script('jquery');
            
            // Leaflet JS
            wp_enqueue_script('leaflet-js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', array(), '1.9.4', true);
            
            // Plugin JS
            wp_enqueue_script('provider-locator-js', plugin_dir_url(__FILE__) . 'assets/js/provider-locator.js', array('jquery', 'leaflet-js'), '1.0.0', true);
            
            // Localize Script
            wp_localize_script('provider-locator-js', 'providerLocator', array(
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('provider_locator_nonce'),
                // Base assets folder (ends with assets/)
                'assetUrl' => plugin_dir_url(__FILE__) . 'assets/'
            ));
        }
    }
    
    /**
     * Enqueue Admin Assets
     */
    public function enqueue_admin_assets($hook) {
        if ('post.php' == $hook || 'post-new.php' == $hook) {
            global $post_type;
            if ('service_provider' === $post_type) {
                wp_enqueue_style('provider-admin-css', plugin_dir_url(__FILE__) . 'assets/css/admin.css', array(), '1.0.0');
            }
        }
    }
    
    /**
     * AJAX: Get Providers by Location
     */
    public function ajax_get_providers() {
        check_ajax_referer('provider_locator_nonce', 'nonce');
        
        $country = isset($_POST['country']) ? sanitize_text_field($_POST['country']) : '';
        $state = isset($_POST['state']) ? sanitize_text_field($_POST['state']) : '';
        $city = isset($_POST['city']) ? sanitize_text_field($_POST['city']) : '';
        
        $args = array(
            'post_type' => 'service_provider',
            'posts_per_page' => -1,
            'post_status' => 'publish'
        );
        
        $tax_query = array('relation' => 'AND');
        
        if ($country) {
            $tax_query[] = array(
                'taxonomy' => 'provider_country',
                'field' => 'slug',
                'terms' => $country
            );
        }
        
        if ($state) {
            $tax_query[] = array(
                'taxonomy' => 'provider_state',
                'field' => 'slug',
                'terms' => $state
            );
        }
        
        if ($city) {
            $tax_query[] = array(
                'taxonomy' => 'provider_city',
                'field' => 'slug',
                'terms' => $city
            );
        }
        
        if (count($tax_query) > 1) {
            $args['tax_query'] = $tax_query;
        }
        
        $query = new WP_Query($args);
        $providers = array();
        
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $post_id = get_the_ID();
                
                $cities = wp_get_post_terms($post_id, 'provider_city');
                $city_name = !empty($cities) ? $cities[0]->name : '';
                
                $providers[] = array(
                    'id' => $post_id,
                    'name' => get_the_title(),
                    'address' => get_post_meta($post_id, '_provider_address', true),
                    'phone' => get_post_meta($post_id, '_provider_phone', true),
                    'email' => get_post_meta($post_id, '_provider_email', true),
                    'website' => get_post_meta($post_id, '_provider_website', true),
                    'latitude' => get_post_meta($post_id, '_provider_latitude', true),
                    'longitude' => get_post_meta($post_id, '_provider_longitude', true),
                    'city' => $city_name,
                    'link' => get_permalink($post_id)
                );
            }
        }
        
        wp_reset_postdata();
        wp_send_json_success($providers);
    }
    
    /**
     * AJAX: Get Cities by State
     */
    public function ajax_get_cities() {
        check_ajax_referer('provider_locator_nonce', 'nonce');
        
        $country = isset($_POST['country']) ? sanitize_text_field($_POST['country']) : '';
        $state = isset($_POST['state']) ? sanitize_text_field($_POST['state']) : '';
        
        $args = array(
            'post_type' => 'service_provider',
            'posts_per_page' => -1,
            'post_status' => 'publish',
            'fields' => 'ids'
        );
        
        $tax_query = array('relation' => 'AND');
        
        if ($country) {
            $tax_query[] = array(
                'taxonomy' => 'provider_country',
                'field' => 'slug',
                'terms' => $country
            );
        }
        
        if ($state) {
            $tax_query[] = array(
                'taxonomy' => 'provider_state',
                'field' => 'slug',
                'terms' => $state
            );
        }
        
        if (count($tax_query) > 1) {
            $args['tax_query'] = $tax_query;
        }
        
        $query = new WP_Query($args);
        $cities = array();
        
        if ($query->have_posts()) {
            foreach ($query->posts as $post_id) {
                $post_cities = wp_get_post_terms($post_id, 'provider_city');
                foreach ($post_cities as $city) {
                    if (!isset($cities[$city->slug])) {
                        $latitude = '';
                        $longitude = '';
                        
                        // Get first provider in this city for coordinates
                        $city_providers = get_posts(array(
                            'post_type' => 'service_provider',
                            'posts_per_page' => 1,
                            'tax_query' => array(
                                array(
                                    'taxonomy' => 'provider_city',
                                    'field' => 'slug',
                                    'terms' => $city->slug
                                )
                            )
                        ));
                        
                        if (!empty($city_providers)) {
                            $latitude = get_post_meta($city_providers[0]->ID, '_provider_latitude', true);
                            $longitude = get_post_meta($city_providers[0]->ID, '_provider_longitude', true);
                        }
                        
                        $cities[$city->slug] = array(
                            'name' => $city->name,
                            'slug' => $city->slug,
                            'latitude' => $latitude,
                            'longitude' => $longitude
                        );
                    }
                }
            }
        }
        
        wp_reset_postdata();
        wp_send_json_success(array_values($cities));
    }

    /**
     * AJAX: Get States and provider counts
     */
    public function ajax_get_states() {
        check_ajax_referer('provider_locator_nonce', 'nonce');

        $country = isset($_POST['country']) ? sanitize_text_field($_POST['country']) : '';

        $states = get_terms(array(
            'taxonomy' => 'provider_state',
            'hide_empty' => false
        ));

        $result = array();

        if (!is_wp_error($states) && !empty($states)) {
            foreach ($states as $state) {
                // Count providers for this state (optionally filter by country)
                $args = array(
                    'post_type' => 'service_provider',
                    'post_status' => 'publish',
                    'posts_per_page' => -1,
                    'fields' => 'ids',
                    'tax_query' => array(
                        array(
                            'taxonomy' => 'provider_state',
                            'field' => 'slug',
                            'terms' => $state->slug
                        )
                    )
                );

                if ($country) {
                    $args['tax_query'][] = array(
                        'taxonomy' => 'provider_country',
                        'field' => 'slug',
                        'terms' => $country
                    );
                }

                $q = new WP_Query($args);
                $count = is_array($q->posts) ? count($q->posts) : 0;

                $result[] = array(
                    'slug' => $state->slug,
                    'name' => $state->name,
                    'count' => $count
                );
            }
        }

        wp_send_json_success($result);
    }
    
    /**
     * Render Locator Map Shortcode
     */
    public function render_locator_map($atts) {
        $atts = shortcode_atts(array(
            'country' => 'usa',
            'type' => 'hero', // 'hero' or 'single'
            'upcoming' => '' // comma separated list of upcoming state slugs
        ), $atts);
        
        ob_start();
        include plugin_dir_path(__FILE__) . 'templates/locator-map.php';
        return ob_get_clean();
    }
    
    /**
     * Plugin Activation
     */
    public function plugin_activation() {
        $this->register_provider_cpt();
        $this->register_taxonomies();
        flush_rewrite_rules();
        
        // Create sample data
        $this->create_sample_data();
    }
    
    /**
     * Create Sample Data
     */
    private function create_sample_data() {
        // Check if data already exists
        $existing = get_posts(array('post_type' => 'service_provider', 'posts_per_page' => 1));
        if (!empty($existing)) return;

        // Create Countries
        $usa = wp_insert_term('USA', 'provider_country', array('slug' => 'usa'));
        $ireland = wp_insert_term('Ireland', 'provider_country', array('slug' => 'ireland'));
        $uae = wp_insert_term('UAE', 'provider_country', array('slug' => 'uae'));
        $uk = wp_insert_term('UK', 'provider_country', array('slug' => 'uk'));

        // Create States for USA
        $florida = wp_insert_term('Florida', 'provider_state', array('slug' => 'florida'));
        $texas = wp_insert_term('Texas', 'provider_state', array('slug' => 'texas'));
        $california = wp_insert_term('California', 'provider_state', array('slug' => 'california'));

        // Create Cities
        $miami = wp_insert_term('Miami', 'provider_city', array('slug' => 'miami'));
        $houston = wp_insert_term('Houston', 'provider_city', array('slug' => 'houston'));
        $los_angeles = wp_insert_term('Los Angeles', 'provider_city', array('slug' => 'los-angeles'));
        $dublin = wp_insert_term('Dublin', 'provider_city', array('slug' => 'dublin'));
        $dubai = wp_insert_term('Dubai', 'provider_city', array('slug' => 'dubai'));
        $london = wp_insert_term('London', 'provider_city', array('slug' => 'london'));

        // Sample Providers
        $providers = array(
            array('title' => 'Miami Aerial Services', 'country' => $usa['term_id'], 'state' => $florida['term_id'], 'city' => $miami['term_id'], 'address' => '123 Ocean Drive, Miami, FL 33139', 'lat' => '25.7617', 'lng' => '-80.1918', 'phone' => '+1 305-555-0123', 'email' => 'info@miamiaerial.com'),
            array('title' => 'Houston Sky Photography', 'country' => $usa['term_id'], 'state' => $texas['term_id'], 'city' => $houston['term_id'], 'address' => '456 Main St, Houston, TX 77002', 'lat' => '29.7604', 'lng' => '-95.3698', 'phone' => '+1 713-555-0124', 'email' => 'contact@houstonsky.com'),
            array('title' => 'LA Drone Solutions', 'country' => $usa['term_id'], 'state' => $california['term_id'], 'city' => $los_angeles['term_id'], 'address' => '789 Hollywood Blvd, Los Angeles, CA 90028', 'lat' => '34.0522', 'lng' => '-118.2437', 'phone' => '+1 323-555-0125', 'email' => 'hello@ladrone.com'),
            array('title' => 'Dublin Aerial View', 'country' => $ireland['term_id'], 'state' => '', 'city' => $dublin['term_id'], 'address' => 'O\'Connell St, Dublin 1, Ireland', 'lat' => '53.3498', 'lng' => '-6.2603', 'phone' => '+353 1 555 0126', 'email' => 'info@dublinaerial.ie'),
            array('title' => 'Dubai Sky Services', 'country' => $uae['term_id'], 'state' => '', 'city' => $dubai['term_id'], 'address' => 'Sheikh Zayed Road, Dubai, UAE', 'lat' => '25.2048', 'lng' => '55.2708', 'phone' => '+971 4 555 0127', 'email' => 'contact@dubaisky.ae'),
            array('title' => 'London Aerial Photography', 'country' => $uk['term_id'], 'state' => '', 'city' => $london['term_id'], 'address' => 'Westminster Bridge Rd, London SE1 7PB', 'lat' => '51.5074', 'lng' => '-0.1278', 'phone' => '+44 20 555 0128', 'email' => 'info@londonaerial.co.uk')
        );

        foreach ($providers as $data) {
            $pid = wp_insert_post(array('post_type' => 'service_provider', 'post_title' => $data['title'], 'post_content' => 'Professional aerial photography and videography services.', 'post_status' => 'publish'));
            if ($pid) {
                wp_set_post_terms($pid, array($data['country']), 'provider_country');
                if (!empty($data['state'])) wp_set_post_terms($pid, array($data['state']), 'provider_state');
                wp_set_post_terms($pid, array($data['city']), 'provider_city');
                update_post_meta($pid, '_provider_address', $data['address']);
                update_post_meta($pid, '_provider_latitude', $data['lat']);
                update_post_meta($pid, '_provider_longitude', $data['lng']);
                update_post_meta($pid, '_provider_phone', $data['phone']);
                update_post_meta($pid, '_provider_email', $data['email']);
            }
        }
    }
}

// Initialize Plugin
ServiceProviderLocator::get_instance();