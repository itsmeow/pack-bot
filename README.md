# Pack Bot

This bot was used in Minecraft Youtuber [a6d](https://www.youtube.com/channel/UCbyS9AQt6KE0XUuGqXya90A)'s "[Minecraft, but 100 kids made the pack](https://www.youtube.com/watch?v=0UZRxrZybiA)" video.

It's a little bit of a hacked-together job and crashes a lot because it's not effecient or well made, but I figured I'd publish the source. Basically, the bot lets people reserve random textures, do them, and then submit them for approval from a moderator team. It's not designed to work on multiple servers, and you need to change the IDs in code for stuff to work.

## Instructions

Now with that out of the way, I would **NOT** suggest using this bot. If you really hate yourself and your time, go ahead. First, you will need to go into index.js and update all the constants pointing to channel, message, and role IDs. You can also change the votes needed. Next, in the Discord you intend to use for the bot, add an emote named `:texture:`. If this doesn't exist, the bot will not work. The image can be anything you want.
Next, make the bot in the Discord developers panel will all permissions and put the token in a ".env" file in the root directory like so:

```
TOKEN=(TOKEN HERE)
```

Next, get a hold of the default Minecraft texture pack or a base texture pack. Extract it, take the "textures" folder, remove ALL mcmeta files (they aren't supported) and non PNG files. Then, remove any textures you don't want to be used. Finally, place the edited textures folder in the root folder of the repository (ex: pack-bot/textures/blocks should be a directory that is valid). Create a folder called "texturesout" and a folder called "approvals" for the bot to use as storage. Make another folder called "data" as well.

Run `npm install` to install the bot's dependencies

Invite the bot to your server using Discord Developer

Lastly, start the bot using `node index.js`

If it somehow doesn't crash, congratulations! Good luck, it will crash more in the future. This bot is **NOT STABLE** and **NOT GOOD**. Don't use it.
