import os
# Specify the directory
directory = "C:/Users/brian.lua/OneDrive - Charles & Keith/Desktop/WorkCollection/template/apersonal"
# Get all files in the directory
filenames = os.listdir(directory)
# Filter out directories, keeping only files
files = [f for f in filenames if os.path.isfile(os.path.join(directory, f))]
print(files)
