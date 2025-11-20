
const OC = 'ryuseungin';
const ID = '31584';

async function run() {
    // 1. Get Title from Body API
    const bodyUrl = `http://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=kcsCgmExpc&ID=${ID}&type=JSON`;
    console.log(`Fetching Body: ${bodyUrl}`);

    let title = '';
    try {
        const res = await fetch(bodyUrl);
        const json = await res.json();
        console.log('Body Response:', JSON.stringify(json, null, 2).substring(0, 500));

        // Extract Title (안건명)
        // Based on user snippet: "응답 필드(주요): ... 안건명 ..."
        // Let's find where it is.
        if (json.KcsCgmExpcService) { // Guessing the root key based on target name
            const info = json.KcsCgmExpcService; // or KcsCgmExpcService.기본정보
            // It might be flat or nested.
            // Let's assume we can find "안건명" in the JSON string
            const str = JSON.stringify(json);
            const match = str.match(/"안건명":"([^"]+)"/);
            if (match) {
                title = match[1];
                console.log(`Found Title: ${title}`);
            }
        }
    } catch (e) {
        console.error('Body Fetch Error:', e);
    }

    if (!title) {
        console.log('Could not extract title, using fallback "관세"');
        title = '관세';
    }

    // 2. Search using Title
    const searchUrl = `http://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=kcsCgmExpc&type=JSON&query=${encodeURIComponent(title)}`;
    console.log(`\nSearching for: ${title}`);
    console.log(`URL: ${searchUrl}`);

    try {
        const res = await fetch(searchUrl);
        const text = await res.text();
        console.log(`Search Response: ${text.substring(0, 500)}`);
    } catch (e) {
        console.error('Search Fetch Error:', e);
    }
}

run();
