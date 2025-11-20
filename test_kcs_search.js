
const OC = 'ryuseungin'; // From user snippet

async function testSearch(target, query) {
    const url = `http://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=${target}&type=JSON&query=${encodeURIComponent(query)}`;
    console.log(`\nTesting search for target=${target}, query=${query}`);
    console.log(`URL: ${url}`);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.log(`Status: ${res.status}`);
            return;
        }
        const text = await res.text();
        console.log(`Response preview: ${text.substring(0, 200)}...`);

        try {
            const json = JSON.parse(text);
            console.log('JSON parsed successfully');
            if (json.LawSearch && json.LawSearch.law) {
                console.log(`Found ${json.LawSearch.law.length} items`);
                console.log('First item:', json.LawSearch.law[0]);
            } else if (json.Result) {
                console.log('Result:', json.Result);
            }
        } catch (e) {
            console.log('Not a JSON response');
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

async function run() {
    await testSearch('kcsCgmExpc', '관세'); // Custom Service Interpretation
    await testSearch('expc', '관세');       // General Law Interpretation
    await testSearch('admrul', '관세');     // Admin Rule (Control)
}

run();
