+++
title = 'ScreeIn Technical Design'
date = 2025-10-12T02:13:25-07:00
draft = false
showSlideToc = true
+++


## Screen-Scoring for “Is the Player Actually Looking at This Object?”


Unreal’s built-in `LineOfSightTo` (and most “AI sight” tutorials) only answer **can this be seen**—a straight line from eye to target’s center with occlusion checks.
In first-person games, we often need **did the player actually notice it**: the object may be at the screen edge, partially visible, or just flicker in for a single frame.

With existing **center-screen ray** for interaction, we added a tiny **anchor** test and **dwell/hysteresis** to robustly detect attention—**without** heavy screen-space sampling or GPU readbacks.

---

### What we made

A **minimal screen-scoring** method that confirms *attention*, not just visibility:

1. **Center ray (hard gate):** one trace forward each frame.  
2. **Anchors (partial-visibility):** 5 light-weight points (AABB 4 corners + center).  
3. **Dwell & hysteresis:** require continuous evidence for `DwellSeconds` to gain attention; require continuous absence for `DropSeconds` to lose it.  
4. **Eccentricity factor:** scale dwell by how close the target’s projected center is to the reticle (closer → faster accumulation).

This keeps cost tiny and behavior human-like.

First we get the AABB of the obeject, we let the anchors be the four corners and the center of object,

{{< figure src = "/PSI/PSI_AABB.png">}}

```cpp
static void CollectAnchors(const AActor* T, TArray<FVector>& Out)
{
    Out.Reset();
    const FBox B = T->GetComponentsBoundingBox(true);
    const FVector Min=B.Min, Max=B.Max, C=B.GetCenter();
    Out.Append({ C,
                 FVector(Min.X, Min.Y, Min.Z),
                 FVector(Max.X, Min.Y, Min.Z),
                 FVector(Min.X, Max.Y, Min.Z),
                 FVector(Max.X, Max.Y, Max.Z) });
}

```

We then test anchors against **two concentric rings** centered at the reticle—**inner radius = short side × 1/4**, **outer radius = short side × 1/2**—and perform a single occlusion trace per point.  
- Inside inner ring: dwell rate = **0.10 s/sec × (1 − d/innerR)**  
- Between inner & outer rings: dwell rate = **0.05 s/sec × linear falloff**  
- Outside outer ring or occluded: **0**


{{< figure src = "/PSI/PSI_ANCHOR.png" >}}

<!-- ```cpp
static bool InRingsAndUnoccluded(const AActor* Target,
                                 const FVector& PtWorld,
                                 float& OutDwellRatePerSec,
                                 float InnerFrac = 0.25f,   // inner radius = short side * 1/4
                                 float OuterFrac = 0.50f,   // outer radius = short side * 1/2
                                 float InnerBase = 0.10f,   // base rate inside inner ring
                                 float OuterBase = 0.05f,   // base rate between inner/outer rings
                                 ECollisionChannel TraceCh = ECC_Visibility)
{
    OutDwellRatePerSec = 0.f;

    auto* PC = UGameplayStatics::GetPlayerController(GWorld, 0);
    if (!PC || !Target) return false;

    // Project world point to screen
    FVector2D S;
    if (!UGameplayStatics::ProjectWorldToScreen(PC, PtWorld, S, /*bPlayerViewportRelative*/false))
        return false;

    // Viewport size
    FIntPoint Size(1,1);
    if (GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport)
        Size = GEngine->GameViewport->Viewport->GetSizeXY();

    // // (Optional) still require the point to be inside the screen rectangle
    // if (S.X < 0 || S.Y < 0 || S.X >= Size.X || S.Y >= Size.Y)
    //     return false;

    // Two concentric rings based on the screen's shorter side
    const float shortSide = (float)FMath::Min(Size.X, Size.Y);
    const FVector2D C(Size.X * 0.5f, Size.Y * 0.5f);
    const float d      = (S - C).Size();          // distance from reticle (pixels)
    const float innerR = shortSide * InnerFrac;   // 1/4 * short side
    const float outerR = shortSide * OuterFrac;   // 1/2 * short side

    // Outside the outer ring → no accumulation
    if (d > outerR)
        return false;

    // Occlusion test: camera → point
    FVector CamLoc; FRotator CamRot; PC->GetPlayerViewPoint(CamLoc, CamRot);
    FHitResult Hit;
    FCollisionQueryParams P(TEXT("AttentionRings"), /*TraceComplex*/true);
    if (const APawn* Pawn = PC->GetPawn()) P.AddIgnoredActor(Pawn);
    P.AddIgnoredActor(Target); // we only care if something blocks the line to the target

    const bool bHit = GWorld->LineTraceSingleByChannel(Hit, CamLoc, PtWorld, TraceCh, P);
    const bool unoccluded = (!bHit) || (Hit.GetActor() == Target);
    if (!unoccluded) return false;

    // Accumulation rate based on ring and inverse distance
    if (d <= innerR)
    {
        // 0.10 s/sec * (1 - d / innerR)  — closer to center → faster
        const float t = 1.f - (d / FMath::Max(innerR, 1e-3f));
        OutDwellRatePerSec = InnerBase * FMath::Clamp(t, 0.f, 1.f);
    }
    else // between inner and outer rings
    {
        // 0.05 s/sec * linear falloff from inner edge to outer edge
        const float t = 1.f - ((d - innerR) / FMath::Max(outerR - innerR, 1e-3f));
        OutDwellRatePerSec = OuterBase * FMath::Clamp(t, 0.f, 1.f);
    }
    return OutDwellRatePerSec > 0.f;
}
``` -->

{{< pseudo>}}
# Compute how fast to add dwell this frame based on reticle proximity.
# Two rings centered at screen center: inner = shortSide*1/4, outer = shortSide*1/2.
FUNCTION DwellRate(pointOnTarget):

  screenPos = ProjectToScreen(pointOnTarget)
  center    = ScreenCenter()
  d         = Distance(screenPos, center)

  innerR = ShortSide() * 0.25
  outerR = ShortSide() * 0.50

  IF d > outerR:
    RETURN 0

  IF d <= innerR:
    # closer → faster, max at center = 0.10 s/sec
    RETURN 0.10 * (1 - d / innerR)
  ELSE:
    # between inner and outer, fades to 0 at outer edge, max 0.05 s/sec
    RETURN 0.05 * (1 - (d - innerR) / (outerR - innerR))


# One frame update: combine center and anchors, then update dwell/drop timers.
FUNCTION UpdateAttention(target, deltaTime):

  # Evidence from center (use target center)
  rateCenter = DwellRate(TargetCenter(target))

  # Evidence from a few anchor points (corners + center)
  rateAnchors = 0
  FOR p IN AnchorPoints(target):
    rateAnchors = MAX(rateAnchors, DwellRate(p))

  dwellRate = MAX(rateCenter, rateAnchors)

  # Accumulate dwell if we have any rate; otherwise count drop time
  IF dwellRate > 0:
    dwell += dwellRate * deltaTime
    drop   = 0
  ELSE:
    drop  += deltaTime
    dwell  = 0

  # Hysteresis: gain after holding, lose after leaving
  IF NOT attention AND dwell >= 0.20:
    attention = TRUE
    dwell = 0

  IF attention AND drop >= 0.20:
    attention = FALSE
    drop = 0
{{< /pseudo>}}

When the `DwellTime` reaches a threshold limit, say `0.2s`, it triggers the event we want

{{< figure src = "/PSI/PSI_FALL.gif" >}}


<!-- {{< youtube id = ILmOSIsdapc start = 53 >}} -->

---
### Thoughts

Another approach is **level design**: gently steer the player toward a small **point of interest** that triggers the event—e.g., high-contrast lighting, a standout prop, or a clear lever/button. This is often cheaper and more reliable for pacing. Still, we want a **programmable** solution to cover systemic cases and edge conditions.

For comparison, **Phasmophobia** uses a camera system where the photo sensor effectively applies a similar *scoring* idea to evaluate snapshot quality. That pipeline is tuned for **captured images**. In contrast, our method tracks **real-time player attention** and triggers events **instantly**, not only when a photo is taken.


---
---

## Level Design into Horror -- From Terror to Horror

Our game 