# rsync all files except .git, target and .gitignore
rsync -av --exclude '.git' --exclude 'target' --exclude '.gitignore' ./* th0r5ti@pohl.rocks:/home/th0r5ti/software/flights-media-server