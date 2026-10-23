import { auth } from '../config/firebase';

export const uploadToCloudinary = async (file, folder, resourceType) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Silakan login kembali sebelum mengunggah gambar.');
  }

  const resolvedResourceType = resourceType || (file.type.startsWith('video/') ? 'video' : 'image');
  const token = await user.getIdToken();
  const signatureResponse = await fetch('/api/cloudinary-signature', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ folder, resourceType: resolvedResourceType }),
  });
  const signatureData = await signatureResponse.json().catch(() => ({}));

  if (!signatureResponse.ok) {
    throw new Error(signatureData.error || 'Tidak dapat menyiapkan upload gambar.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signatureData.apiKey);
  formData.append('timestamp', signatureData.timestamp);
  formData.append('signature', signatureData.signature);
  formData.append('folder', signatureData.folder);

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/${resolvedResourceType}/upload`,
    { method: 'POST', body: formData }
  );
  const uploadData = await uploadResponse.json().catch(() => ({}));

  if (!uploadResponse.ok) {
    throw new Error(uploadData.error?.message || 'Cloudinary gagal menerima gambar.');
  }
  if (!uploadData.secure_url) {
    throw new Error('Cloudinary tidak mengembalikan URL gambar.');
  }

  return uploadData.secure_url;
};
