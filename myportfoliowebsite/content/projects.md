+++
title = 'Projects'
type = 'projects'
date = 2024-09-11T12:01:57-07:00
showSlideToc = true
+++

<!-- Working on this page, anyone know how to include youtube embedd to md file?

Guess I found it! use shortcode! -->
# ----Featured Projects----
# __ScreeIn__
[Steam](https://store.steampowered.com/app/3810820/ScreeIN/)  
[Technical Design Summary]({{< ref "screeintechdesign.md" >}}) 

This psychological horror game is built with **UE5**, focusing on **atmospheric environment design** and **immersive mood setting**. Utilizing **UE Sequencer**, the game seamlessly blends cinematic storytelling with gameplay to enhance player immersion.

{{< gallery
  "/PSI/PSI_0.png"
  "/PSI/PSI_1.png"
  "/PSI/PSI_7.png"
  "/PSI/PSI_2.png"
  "/PSI/PSI_3.png" 
  "/PSI/PSI_4.png" 
  "/PSI/PSI_5.png"
  "/PSI/PSI_6.png"
>}}

{{< youtube EAn3e9ZSjdM>}}



# __Escape Room Game (FYP)__
[Play On Itch.io](https://miunovo.itch.io/escaperoomgame)

This is an escape room game build with **UE5**, alonged with 4 puzzles consist with 9 pickable objects and 4 interaction mechanisms. A **key-lock linkage system** is embedded in the game through **event dispatcher**. The player can use a reveal glasses to reveal hidden clues. It also features a **level editor** that allows player to customize a level with all the objects in the game and **save/load** the level.
<!-- https://youtu.be/3336_mtPs6E -->
<!-- {{<figure src="/UMLMechanism_0.png">}}  -->


{{< gallery
  "/PECR/GameTitle.png"
  "/PECR/GameScene_0.png"
  "/PECR/GameScene_1.png"
  "/PECR/GameScene_2.png" 
  "/PECR/UMLMechanism_0.png" 
  "/PECR/UMLMechanism_1.png"
>}}

{{< youtube-dual "3336_mtPs6E" "IIZawvk6qgU" >}}


# __Fire All The Thing__
[Play On Itch.io](https://miunovo.itch.io/fire-all-the-thing)

This is a top-down 2D shooting game build with **Unity** for **1-Bit Game Jam**. All the game functional structure was implemented, such as player movement and items. **Object pool** was used in generating the flame path for  character. Moreover, it is in **WebGL** build for online playing. ~~(its a very old project, just putting here to show my Unity skill)~~. 

Ranked 151 overall in 550 submissions.

{{< gallery
	"/PFAT/FAT_0.gif"
	"/PFAT/FAT_1.gif"
  "/PFAT/FAT_2.gif"
>}}

{{< gallery
	"/PFAT/FAT_3.gif"
	"/PFAT/Result.png"
>}}


# __XPBD Cloth Simulation__
[GitHub](https://github.com/Yanggoo/X-PBD-Cloth-Simulation)

A **real-time** cloth simulation project using **Extended Position-Based Dynamics (XPBD)**.    
- Modular framework with rendering, GUI, and scene management.  
- **CPU** and **GPU** solvers accelerated with **CUDA**.  
- Realistic constraints: stretching, bending, shrinking, and self-collision.  
- **Performance optimization** with spatial partitioning and dynamic interactions.

{{< gallery
	"/XPBDCS/PBDCS1.gif"
	"/XPBDCS/PBDCS2.gif"
	"/XPBDCS/PBDCS3.gif"
>}}



# ----Recent Projects----


# __Personal Game Library__
[Go To Library](https://fuchsia-oak-fc0.notion.site/Games-1426bb49dd0f8183b8dbd367fc49c427?pvs=4)

A personal game record library recording games I played and my reviews, build with Notion.
<!-- {{< emd_page "https://www.notioniframe.com/notion/1qqqca5py9d" >}} -->

{{< gallery 
	"/GDB/GDB1.png"
	"/GDB/GDB2.png"
>}}

# __BU88LE (mini-game)__
[Play On Itch.io](https://brianjiang.itch.io/bu88le)

An extendable **mini-game** built with **Unity** for **Globle Game Jam 2025**, where players click the screen to blow bubbles and align them with the background image. Pressing the space button captures a photo, generating a similarity percentage. **Signed Distance Fields (SDF)** were used to enable smooth bubble merging. ~~We ate too much brunch during jam..~~

{{< gallery 
	"/PB8/PB8_0.png"
	"/PB8/PB8_1.png"
  "/PB8/PB8_2.png"
>}}

# __DataViz 0.2__

This is a data visualization software, I implemented **incremental** requirements for this school project with **Qt** and **C++**, ensuring continuous improvement and adaptability. Specifically, the histogram plot and data expression calculation. I also added more convenient **user interaction** for plotting and curve customization. Moreover, I optimized the data import and plotting speed with **Multi-Thread**. The efficiency reached a gain of **75%**. 
{{<figure src="/PDV0/Improvement.png">}}
{{< youtube cbaRGa0UTos >}}


# NobOdy (Pitch Design Doc)

A thought of boss rush + simple mechanism + 2D->3D. [link](/DNBD/NobOdy.pdf)



# CLUE (Game system anlysis)

A system analysis graph for classic party board game, Clue. Including a graph of the formal element of the game and a flowchart graph for the game loop.

{{< gallery 
	"/CSAC/System_Analysis_Frame_1.png"
	"/CSAC/System_Analysis_Frame_2.png"
>}}


<!-- # Infineight Toybox -->


