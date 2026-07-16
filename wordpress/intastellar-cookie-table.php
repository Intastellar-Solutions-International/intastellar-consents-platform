<?php
/**
 * Plugin Name:  Intastellar Cookie Table
 * Plugin URI:   https://intastellar.eu
 * Description:  Shortcode [intastellar_cookie_table domain="example.com"] — renders a live cookie disclosure table for any domain, powered by the Intastellar Cookie Consents scanner.
 * Version:      1.0.0
 * Author:       Intastellar Solutions
 * Author URI:   https://intastellar.eu
 * License:      MIT
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ── Shortcode ────────────────────────────────────────────────────────────────

function ics_cookie_table_shortcode( $atts ) {
    $atts = shortcode_atts( [
        'domain' => '',
    ], $atts, 'intastellar_cookie_table' );

    $domain = sanitize_text_field( trim( $atts['domain'] ) );
    $domain = preg_replace( '#^https?://#', '', $domain );
    $domain = strtolower( explode( '/', $domain )[0] );

    if ( ! $domain ) {
        return '<!-- intastellar_cookie_table: domain attribute is required -->';
    }

    $data = ics_fetch_cookie_data( $domain );

    if ( is_wp_error( $data ) || empty( $data['categories'] ) ) {
        return '<p class="ics-error">Cookie data for <strong>' . esc_html( $domain ) . '</strong> could not be loaded.</p>';
    }

    return ics_render_table( $data );
}
add_shortcode( 'intastellar_cookie_table', 'ics_cookie_table_shortcode' );

// ── Data fetching with transient cache ──────────────────────────────────────

function ics_fetch_cookie_data( $domain ) {
    $key      = 'ics_ct_' . md5( $domain );
    $cached   = get_transient( $key );
    if ( $cached !== false ) return $cached;

    $response = wp_remote_get(
        'https://www.intastellarconsents.com/api/cookie-banner?domain=' . urlencode( $domain ),
        [ 'timeout' => 20, 'sslverify' => true ]
    );

    if ( is_wp_error( $response ) ) return $response;

    $code = wp_remote_retrieve_response_code( $response );
    if ( $code !== 200 ) {
        return new WP_Error( 'ics_api_error', "API returned HTTP $code" );
    }

    $data = json_decode( wp_remote_retrieve_body( $response ), true );
    if ( ! $data ) return new WP_Error( 'ics_parse_error', 'Could not parse API response' );

    // Cache for 2 hours — matches the scan cadence
    set_transient( $key, $data, 2 * HOUR_IN_SECONDS );

    return $data;
}

// Allows clearing the cache from a plugin/theme (e.g. after a new scan)
function ics_clear_cookie_cache( $domain ) {
    delete_transient( 'ics_ct_' . md5( $domain ) );
}

// ── Rendering ────────────────────────────────────────────────────────────────

function ics_render_table( $data ) {
    $categories = $data['categories'] ?? [];
    $scanned_at = isset( $data['scanned_at'] )
        ? date_i18n( get_option( 'date_format' ), strtotime( $data['scanned_at'] ) )
        : null;

    $category_meta = [
        'necessary'  => [ 'label' => __( 'Necessary',  'ics' ), 'desc' => __( 'Essential for the website to function. Cannot be disabled.',                                  'ics' ) ],
        'analytics'  => [ 'label' => __( 'Analytics',  'ics' ), 'desc' => __( 'Help us understand how visitors interact with the website.',                                  'ics' ) ],
        'marketing'  => [ 'label' => __( 'Marketing',  'ics' ), 'desc' => __( 'Used to track visitors across websites to display relevant advertisements.',                  'ics' ) ],
        'functional' => [ 'label' => __( 'Functional', 'ics' ), 'desc' => __( 'Enable enhanced functionality and personalisation, such as embedded content.',                'ics' ) ],
        'security'   => [ 'label' => __( 'Security',   'ics' ), 'desc' => __( 'Protect the website and its users against fraudulent activities and security breaches.',      'ics' ) ],
    ];

    ob_start();
    ?>
    <div class="ics-cookie-table" data-domain="<?php echo esc_attr( $data['domain'] ?? '' ); ?>">

        <?php foreach ( $category_meta as $key => $meta ) :
            $cookies = $categories[ $key ]['cookies'] ?? [];
            if ( empty( $cookies ) ) continue;
        ?>
        <div class="ics-category">
            <div class="ics-category__header">
                <span class="ics-category__badge ics-category__badge--<?php echo esc_attr( $key ); ?>">
                    <?php echo esc_html( $meta['label'] ); ?>
                </span>
                <p class="ics-category__desc"><?php echo esc_html( $meta['desc'] ); ?></p>
            </div>

            <table class="ics-table">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Cookie', 'ics' ); ?></th>
                        <th><?php esc_html_e( 'Provider', 'ics' ); ?></th>
                        <th><?php esc_html_e( 'Purpose', 'ics' ); ?></th>
                        <th><?php esc_html_e( 'Expiry', 'ics' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $cookies as $cookie ) : ?>
                    <tr>
                        <td><code class="ics-cookie-name"><?php echo esc_html( $cookie['name'] ); ?></code></td>
                        <td><?php echo esc_html( $cookie['provider'] ?? '—' ); ?></td>
                        <td><?php echo esc_html( $cookie['description'] ?? '—' ); ?></td>
                        <td><?php echo esc_html( ics_format_expiry( $cookie ) ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endforeach; ?>

        <?php if ( $scanned_at ) : ?>
        <p class="ics-footer">
            <?php printf(
                /* translators: %s = date */
                esc_html__( 'Last scanned: %s', 'ics' ),
                esc_html( $scanned_at )
            ); ?>
            &nbsp;·&nbsp;
            <a href="https://intastellar.eu" target="_blank" rel="noopener noreferrer">
                <?php esc_html_e( 'Powered by Intastellar Cookie Consents', 'ics' ); ?>
            </a>
        </p>
        <?php endif; ?>

    </div>
    <?php
    return ob_get_clean();
}

function ics_format_expiry( $cookie ) {
    if ( ! empty( $cookie['session'] ) ) return __( 'Session', 'ics' );

    $expires = $cookie['expires'] ?? null;
    if ( $expires === null || $expires === -1 ) return '—';

    // Puppeteer returns a Unix timestamp in seconds
    if ( is_numeric( $expires ) && $expires > 1000000 ) {
        $diff_days = round( ( $expires - time() ) / DAY_IN_SECONDS );
        if ( $diff_days <= 0 )  return __( 'Session', 'ics' );
        if ( $diff_days === 1 ) return __( '1 day', 'ics' );
        if ( $diff_days < 365 ) return sprintf( __( '%d days', 'ics' ), $diff_days );
        $years = round( $diff_days / 365, 1 );
        return sprintf( __( '%s year(s)', 'ics' ), $years );
    }

    return (string) $expires;
}

// ── Styles ───────────────────────────────────────────────────────────────────

function ics_enqueue_styles() {
    wp_register_style( 'ics-cookie-table', false );
    wp_enqueue_style( 'ics-cookie-table' );
    wp_add_inline_style( 'ics-cookie-table', ics_inline_css() );
}
add_action( 'wp_enqueue_scripts', 'ics_enqueue_styles' );

function ics_inline_css() {
    return '
.ics-cookie-table { font-family: inherit; color: inherit; }
.ics-category { margin-bottom: 2em; }
.ics-category__header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.ics-category__badge {
    display: inline-flex; align-items: center;
    padding: 3px 10px; border-radius: 5px;
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
    white-space: nowrap;
}
.ics-category__badge--necessary  { background: #d4edda; color: #155724; }
.ics-category__badge--analytics  { background: #cce5ff; color: #004085; }
.ics-category__badge--marketing  { background: #f8d7da; color: #721c24; }
.ics-category__badge--functional { background: #fff3cd; color: #856404; }
.ics-category__badge--security   { background: #e2d9f3; color: #4a235a; }
.ics-category__desc { margin: 0; font-size: 0.875rem; color: #666; }
.ics-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.ics-table th {
    text-align: left; padding: 8px 12px;
    background: #f8f9fa; border-bottom: 2px solid #dee2e6;
    font-weight: 600; white-space: nowrap;
}
.ics-table td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
.ics-table tr:last-child td { border-bottom: none; }
.ics-cookie-name {
    background: #f0f0f0; padding: 2px 6px; border-radius: 3px;
    font-size: 0.8em; word-break: break-all;
}
.ics-footer { font-size: 0.75rem; color: #999; margin-top: 1em; }
.ics-footer a { color: inherit; }
.ics-error { color: #721c24; background: #f8d7da; padding: 10px 14px; border-radius: 4px; }
';
}
