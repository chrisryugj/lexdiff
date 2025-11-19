'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface LogImportProps {
  onImport: (uploadedFiles: string[]) => void;
}

export default function LogImport({ onImport }: LogImportProps) {
  const [importing, setImporting] = useState(false);
  const [logText, setLogText] = useState('');
  const [showDialog, setShowDialog] = useState(false);

  function parseLog(text: string): string[] {
    const uploadedFiles: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      // 업로드 성공 로그 패턴 찾기
      // 예: "✅ 업로드 성공: 서울특별시 동대문구 조례.md"
      // 예: "[1/100] ✅ 서울특별시 동대문구 조례.md"
      const successMatch =
        line.match(/✅.*?업로드.*?:\s*(.+?)\.md/) ||
        line.match(/✅\s+(.+?)\.md/) ||
        line.match(/\[\d+\/\d+\]\s*✅\s*(.+?)\.md/);

      if (successMatch) {
        const filename = successMatch[1].trim() + '.md';
        if (!uploadedFiles.includes(filename)) {
          uploadedFiles.push(filename);
        }
      }
    }

    return uploadedFiles;
  }

  function handleImportLog() {
    setImporting(true);
    try {
      const uploadedFiles = parseLog(logText);

      if (uploadedFiles.length === 0) {
        alert('로그에서 업로드된 파일을 찾을 수 없습니다.\n\n로그 형식 예시:\n✅ 업로드 성공: 서울특별시 조례.md');
        return;
      }

      alert(`${uploadedFiles.length}개 파일을 로그에서 찾았습니다.`);
      onImport(uploadedFiles);
      setShowDialog(false);
      setLogText('');
    } catch (error: any) {
      alert(`로그 파싱 실패: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setLogText(text);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        variant="outline"
        size="default"
      >
        로그 임포트
      </Button>

      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                업로드 로그 임포트
              </h2>
              <button
                onClick={() => setShowDialog(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                집에서 업로드한 로그 파일을 선택하거나 로그 내용을 붙여넣으세요.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  로그 파일 선택:
                </label>
                <input
                  type="file"
                  accept=".txt,.log"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                또는 로그 내용 붙여넣기:
              </label>
              <textarea
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="업로드 로그를 여기에 붙여넣으세요...

예시:
✅ [1/100] 서울특별시 동대문구 조례.md
✅ 업로드 성공: 서울특별시 중랑구 조례.md"
                className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDialog(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={handleImportLog}
                disabled={!logText.trim() || importing}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {importing ? '처리 중...' : '임포트'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
