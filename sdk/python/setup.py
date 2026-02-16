from setuptools import setup, find_packages

setup(
    name="xilian-sdk",
    version="1.0.0",
    description="西联工业物联网平台 Python SDK",
    long_description=open("README.md").read() if __import__("os").path.exists("README.md") else "",
    long_description_content_type="text/markdown",
    author="西联平台技术团队",
    author_email="sdk@xilian.io",
    url="https://github.com/xilian/sdk-python",
    packages=find_packages(),
    python_requires=">=3.10",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: Other/Proprietary License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Scientific/Engineering",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
)
