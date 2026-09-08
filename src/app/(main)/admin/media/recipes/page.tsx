import Image from "next/image";
import { Card, CardContent } from "@/components/shadcn/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { listVisualRecipes } from "@/lib/case-media";
import { admin } from "@/lib/strings";
import styles from "../../admin.module.css";

export default function MediaRecipesPage() {
  const recipes = listVisualRecipes();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.mediaRecipesTitle}</h1>
        <p className={styles.intro}>{admin.mediaRecipesIntro}</p>
      </header>

      <div className={styles.recipeGrid}>
        {recipes.map((recipe) => (
          <Card className={styles.recipeCard} key={recipe.id}>
            {recipe.previewSrc === null ||
            recipe.previewWidth === null ||
            recipe.previewHeight === null ? null : (
              <div className={styles.recipePreview}>
                <Image
                  alt=""
                  height={recipe.previewHeight}
                  sizes="(max-width: 560px) 100vw, (max-width: 1080px) 50vw, 340px"
                  src={recipe.previewSrc}
                  width={recipe.previewWidth}
                />
              </div>
            )}
            <CardContent className={styles.recipeBody}>
              <div className={styles.recipeHeading}>
                <h2>{recipe.key}</h2>
                <span>{admin.mediaRecipeVersion(recipe.version)}</span>
              </div>
              <StructuredList
                rows={[
                  { label: admin.mediaRecipeIntent, value: recipe.intent },
                  {
                    label: admin.mediaRecipeAssets,
                    value: admin.mediaRecipeCount(recipe.assetCount),
                  },
                  {
                    label: admin.mediaRecipePlacements,
                    value: admin.mediaRecipeUses(recipe.placementCount),
                  },
                ]}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const metadata = {
  title: `${admin.mediaRecipesTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
