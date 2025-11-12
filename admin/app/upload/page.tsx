import FileUploadForm from '@/components/file-upload-form';

export default function UploadPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Upload Files</h1>
        <p className="mt-2 text-gray-600">
          파일을 Gemini File Search에 업로드하고 자동으로 인덱싱합니다
        </p>
      </div>

      <FileUploadForm />
    </div>
  );
}
