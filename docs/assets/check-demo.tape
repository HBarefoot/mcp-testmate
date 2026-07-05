# Recorded with charmbracelet/vhs — see record-demos.sh for the full setup.
# The baseline was snapshotted against the healthy fixture; the live server
# is drifted-server.mjs (the "bad commit").
Output check-demo.gif

Set Shell bash
Set FontSize 14
Set Width 700
Set Height 340
Set Padding 12
Set WindowBar Colorful
Set TypingSpeed 40ms
Set Framerate 20

Hide
Type "export PATH=/tmp/mcp-testmate-vhs/bin:$PATH && cd /tmp/mcp-testmate-vhs/check-demo && clear"
Enter
Show

Sleep 600ms
Type "mcp-testmate check"
Sleep 400ms
Enter
Sleep 6s
