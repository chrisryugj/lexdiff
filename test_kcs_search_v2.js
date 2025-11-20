
const OC = 'ryuseungin';

async function testUrl(name, url) {
    console.log(`\n--- Testing ${name} ---`);
    console.log(`URL: ${url}`);
    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log(`Status: ${res.status}`);
        console.log(`Preview: ${text.substring(0, 300)}`);

        try {
            const json = JSON.parse(text);
            // Check what kind of root key we get
            const keys = Object.keys(json);
            console.log(`Root Keys: ${keys.join(', ')}`);

            if (json.AdmRulSearch) {
                console.log('Type: Admin Rule Search Result');
                if (json.AdmRulSearch.admrul && json.AdmRulSearch.admrul.length > 0) {
                    console.log('First Item:', JSON.stringify(json.AdmRulSearch.admrul[0], null, 2));
                }
            } else if (json.ExpcSearch) {
                console.log('Type: Law Interpretation Search Result');
                if (json.ExpcSearch.expc && json.ExpcSearch.expc.length > 0) {
                    console.log('First Item:', JSON.stringify(json.ExpcSearch.expc[0], null, 2));
                }
            } else if (json.Result) {
                console.log('Result:', json.Result);
            } else {
                console.log('Unknown JSON structure');
            }
        } catch (e) {
            console.log('Not JSON');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

async function run() {
    const query = encodeURIComponent('관세');

    // 1. lawSearch.do with target=kcsCgmExpc
    await testUrl('Search kcsCgmExpc', `http://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=kcsCgmExpc&type=JSON&query=${query}`);

    // 2. lawService.do with target=kcsCgmExpc (List mode?)
    await testUrl('Service kcsCgmExpc (List?)', `http://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=kcsCgmExpc&type=JSON&query=${query}`);

    // 3. lawSearch.do with target=expc
    await testUrl('Search expc', `http://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=expc&type=JSON&query=${query}`);
}

run();
