export async function fetchLogoBase64(): Promise<string> {
  const url = `${import.meta.env.BASE_URL}images/dormi-logo.png`;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
