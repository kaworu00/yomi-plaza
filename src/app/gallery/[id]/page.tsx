import { notFound } from "next/navigation";
import { GalleryDetailView } from "@/components/gallery-detail-view";
import { getCurrentProfile, getGalleryImage } from "@/lib/queries";

type GalleryDetailPageProps = {
  params: {
    id: string;
  };
};

export default async function GalleryDetailPage({ params }: GalleryDetailPageProps) {
  const [image, profile] = await Promise.all([getGalleryImage(params.id), getCurrentProfile()]);

  if (!image) {
    notFound();
  }

  return <GalleryDetailView image={image} profile={profile} />;
}
